#!/usr/bin/env python3
"""Build the portfolio site into dist/.

Reads site.json and the photos/<category>/ folders, makes web-sized copies
of every photo (metadata and GPS stripped, colour converted to sRGB), and
fills in the page template from src/.

    python build.py            build into dist/
    python build.py --serve    build, then preview at http://localhost:8000
"""

import hashlib
import html
import io
import json
import os
import re
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from datetime import date
from pathlib import Path

from PIL import ExifTags, Image, ImageCms, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
PHOTOS = ROOT / "photos"
DIST = ROOT / "dist"
CACHE = ROOT / ".cache"

# Dark / light switch in the header (theme.js shows the right icon and label).
THEME_TOGGLE = (
    '<button class="theme-toggle" type="button" aria-label="Switch between dark and light mode">'
    '<svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2'
    'M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>'
    '<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/></svg>'
    '</button>'
)

# Image settings. Changing any of these re-processes every photo.
GRID_BOX = (2400, 720)   # gallery thumbnails: fit inside this box
FULL_EDGE = 2400         # full-screen viewer: longest edge
GRID_QUALITY = 78
FULL_QUALITY = 84
SETTINGS_KEY = f"v3-{GRID_BOX}-{FULL_EDGE}-{GRID_QUALITY}-{FULL_QUALITY}"

PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
UNSUPPORTED_EXTS = {".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".orf",
                    ".rw2", ".heic", ".heif"}
LARGE_FILE_MB = 6

IN_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))

CAMERA_NAMES = {
    "ILCE-6700": "Sony α6700",
    "ILCE-6400": "Sony α6400",
    "ILCE-6600": "Sony α6600",
    "ILCE-7M3": "Sony α7 III",
    "ILCE-7M4": "Sony α7 IV",
    "ILCE-7CM2": "Sony α7C II",
    "ILME-FX30": "Sony FX30",
    "ILME-FX3": "Sony FX3",
}

CAMERA_FILENAME = re.compile(
    r"^(_?dsc[f_]?|img|dji|pxl|mvimg|gopr|_mg|mg|p\d{3}|screenshot|photo)[\s_-]*\d+",
    re.IGNORECASE,
)


# ---------------------------------------------------------------- messages

def warn(message, path=None):
    if IN_ACTIONS:
        where = f" file={path.relative_to(ROOT)}" if path else ""
        print(f"::warning{where}::{message}")
    else:
        prefix = f"{path.relative_to(ROOT)}: " if path else ""
        print(f"  warning: {prefix}{message}")


# ---------------------------------------------------------------- helpers

def natural_key(name):
    return [int(part) if part.isdigit() else part.lower()
            for part in re.split(r"(\d+)", name)]


def strip_order_prefix(stem):
    return re.sub(r"^\d+[\s._-]+", "", stem)


def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "photo"


def title_from_filename(stem):
    """A caption from a descriptive filename, or None for camera names."""
    name = strip_order_prefix(stem)
    if CAMERA_FILENAME.match(name) or len(re.findall(r"[A-Za-z]", name)) < 3:
        return None
    words = re.sub(r"[_-]+", " ", name).strip()
    words = re.sub(r"\s+", " ", words)
    return words[:1].upper() + words[1:]


def as_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return number if number > 0 else None


def camera_settings(img):
    """Readable shooting settings from EXIF, plus whether GPS data exists."""
    exif = img.getexif()
    sub = exif.get_ifd(ExifTags.IFD.Exif)
    has_gps = bool(exif.get_ifd(ExifTags.IFD.GPSInfo))

    make = str(exif.get(0x010F) or "").strip().strip("\x00")
    model = str(exif.get(0x0110) or "").strip().strip("\x00")
    focal = as_float(sub.get(0x920A))
    fnum = as_float(sub.get(0x829D))
    shutter = as_float(sub.get(0x829A))
    iso = sub.get(0x8827)
    if isinstance(iso, (tuple, list)):
        iso = iso[0] if iso else None

    parts = []
    if model:
        if model in CAMERA_NAMES:
            parts.append(CAMERA_NAMES[model])
        elif model.startswith(("ILCE-", "ILME-")) and make.upper() == "SONY":
            parts.append("Sony " + model.split("-", 1)[1])
        elif make and not model.lower().startswith(make.lower().split()[0]):
            parts.append(f"{make.title()} {model}")
        else:
            parts.append(model)
    if focal:
        parts.append(f"{round(focal)} mm")
    if fnum:
        parts.append(f"f/{round(fnum, 1):g}")
    if shutter:
        if shutter >= 0.3:
            parts.append(f"{round(shutter, 1):g} s")
        else:
            parts.append(f"1/{round(1 / shutter)} s")
    if iso:
        parts.append(f"ISO {iso}")
    return parts, has_gps


def to_srgb(img):
    """Convert to 8-bit sRGB so colours look right once the profile is gone."""
    icc = img.info.get("icc_profile")
    if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
        img = img.convert("RGBA")
        backdrop = Image.new("RGBA", img.size, (41, 42, 41, 255))
        img = Image.alpha_composite(backdrop, img)
    if icc:
        try:
            source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            name = ImageCms.getProfileDescription(source).lower()
            if "srgb" not in name and "iec61966" not in name:
                if img.mode not in ("RGB", "CMYK", "L"):
                    img = img.convert("RGB")
                img = ImageCms.profileToProfile(img, source, SRGB, outputMode="RGB")
        except (ImageCms.PyCMSError, OSError, ValueError):
            pass  # unreadable profile: fall back to treating it as sRGB
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def process_photo(job):
    """Runs in a worker process. Returns metadata for one photo."""
    src, digest = job
    meta_path = CACHE / f"{digest}.json"
    grid_path = CACHE / f"{digest}-g.webp"
    full_path = CACHE / f"{digest}-f.webp"
    if meta_path.exists() and grid_path.exists() and full_path.exists():
        return json.loads(meta_path.read_text())

    with Image.open(src) as opened:
        opened.load()
        settings, has_gps = camera_settings(opened)
        img = ImageOps.exif_transpose(opened)
        img.info["icc_profile"] = opened.info.get("icc_profile")
        img = to_srgb(img)

    full = img.copy()
    full.thumbnail((FULL_EDGE, FULL_EDGE), Image.Resampling.LANCZOS)
    full.info = {}
    full.save(full_path, "WEBP", quality=FULL_QUALITY, method=5)

    grid = img.copy()
    grid.thumbnail(GRID_BOX, Image.Resampling.LANCZOS)
    grid = grid.filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=2))
    grid.info = {}
    grid.save(grid_path, "WEBP", quality=GRID_QUALITY, method=5)

    r, g, b = img.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    meta = {
        "w": full.width, "h": full.height,
        "gw": grid.width, "gh": grid.height,
        "c": f"#{r:02x}{g:02x}{b:02x}",
        "x": settings,
        "gps": has_gps,
    }
    meta_path.write_text(json.dumps(meta))
    return meta


def file_digest(path):
    h = hashlib.sha1(SETTINGS_KEY.encode())
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def youtube_id(value):
    value = str(value).strip()
    match = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})", value)
    if match:
        return match.group(1)
    return value if re.fullmatch(r"[A-Za-z0-9_-]{11}", value) else None


# ---------------------------------------------------------------- build

def collect(config):
    categories, jobs = [], []
    for cat in config["categories"]:
        folder = PHOTOS / cat["folder"]
        entry = {"id": slugify(cat["folder"]), "label": cat.get("label") or cat["folder"].title(),
                 "cover": str(cat.get("cover") or "").strip(), "files": []}
        if folder.is_dir():
            files = sorted((p for p in folder.iterdir() if p.is_file()),
                           key=lambda p: natural_key(p.name))
            for path in files:
                ext = path.suffix.lower()
                if ext in UNSUPPORTED_EXTS:
                    warn(f"{ext} files can't be shown on the web. Export a JPG instead.", path)
                    continue
                if ext not in PHOTO_EXTS:
                    continue
                size_mb = path.stat().st_size / 1e6
                if size_mb > LARGE_FILE_MB:
                    warn(f"{size_mb:.0f} MB is large for the repo. Export at 2560 px "
                         "on the long edge to save space.", path)
                digest = file_digest(path)
                entry["files"].append((path, digest))
                jobs.append((path, digest))
        else:
            warn(f"folder photos/{cat['folder']} doesn't exist, so that category is empty")
        categories.append(entry)
    return categories, jobs


def render(template, values):
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: values.get(m.group(1), ""), template)


def esc(text):
    return html.escape(str(text), quote=True)


def build():
    config = json.loads((ROOT / "site.json").read_text(encoding="utf-8"))
    CACHE.mkdir(exist_ok=True)

    categories, jobs = collect(config)
    print(f"Processing {len(jobs)} photo(s)...")

    results = {}
    if jobs:
        with ProcessPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
            for (path, digest), outcome in zip(jobs, pool.map(_safe_process, jobs)):
                if isinstance(outcome, str):
                    warn(f"skipped, couldn't read this image ({outcome})", path)
                else:
                    results[digest] = outcome

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SRC, DIST, ignore=shutil.ignore_patterns("index.html", "contact.html", ".*"))

    data_categories, all_photos, used = [], [], set()
    gps_files = []
    for cat in categories:
        out_dir = DIST / "img" / cat["id"]
        out_dir.mkdir(parents=True, exist_ok=True)
        photos, seen, cover = [], set(), None
        for number, (path, digest) in enumerate(cat["files"], start=1):
            meta = results.get(digest)
            if not meta:
                continue
            used.add(digest)
            if meta.get("gps"):
                gps_files.append(path)
            slug = slugify(strip_order_prefix(path.stem))
            while slug in seen:
                slug += "-2"
            seen.add(slug)
            name = f"{slug}-{digest[:8]}"
            shutil.copyfile(CACHE / f"{digest}-g.webp", out_dir / f"{name}-g.webp")
            shutil.copyfile(CACHE / f"{digest}-f.webp", out_dir / f"{name}-f.webp")
            title = title_from_filename(path.stem)
            photo = {
                "id": f"{cat['id']}-{slug}",
                "g": f"img/{cat['id']}/{name}-g.webp",
                "f": f"img/{cat['id']}/{name}-f.webp",
                "w": meta["w"], "h": meta["h"],
                "c": meta["c"],
                "alt": title or f"{cat['label']} photo {len(photos) + 1}",
            }
            if title:
                photo["t"] = title
            if config.get("show_camera_settings", True) and meta["x"]:
                photo["x"] = meta["x"]
            photos.append(photo)
            all_photos.append((path, photo))
            if cat["cover"] and path.name == cat["cover"]:
                cover = photo
        entry = {"id": cat["id"], "label": cat["label"], "photos": photos}
        if photos:
            # The cover card uses the photo named in site.json, else the first one.
            chosen = cover if cover else photos[0]
            if cat["cover"] and not cover:
                warn(f"cover '{cat['cover']}' wasn't found in photos/{cat['id']}, using the first photo")
            entry["cover"], entry["coverColor"] = chosen["g"], chosen["c"]
        data_categories.append(entry)

    # Remove cache entries for photos that no longer exist.
    for item in CACHE.iterdir():
        if item.name.split("-")[0].split(".")[0] not in used:
            item.unlink()

    if gps_files:
        warn(f"{len(gps_files)} photo(s) in the repo contain GPS location data. The website "
             "copies are cleaned, but anyone can download the originals from a public repo. "
             "Turn on 'Remove location info' when exporting.")
        for path in gps_files:
            warn("contains GPS location data", path)

    videos = []
    for item in config.get("videos", []):
        if isinstance(item, str):
            item = {"url": item}
        vid = youtube_id(item.get("url") or item.get("youtube") or "")
        if not vid:
            warn(f"couldn't find a YouTube video ID in {item!r}")
            continue
        url = str(item.get("url") or "")
        videos.append({"id": vid, "title": item.get("title", ""),
                       "vertical": bool(item.get("vertical")) or "/shorts/" in url})

    # Share image for link previews.
    share = None
    wanted = str(config.get("share_photo") or "").strip().strip("/")
    for path, _photo in all_photos:
        rel = path.relative_to(PHOTOS).as_posix()
        if wanted and (rel == wanted or path.name == wanted):
            share = path
            break
    if share is None and all_photos:
        if wanted:
            warn(f"share_photo '{wanted}' wasn't found, using the first photo instead")
        share = all_photos[0][0]
    site_url = str(config.get("site_url") or "").strip().rstrip("/")
    if share:
        with Image.open(share) as opened:
            img = to_srgb(ImageOps.exif_transpose(opened))
        card = ImageOps.fit(img, (1200, 630), Image.Resampling.LANCZOS)
        card.info = {}
        card.save(DIST / "og.jpg", "JPEG", quality=85, optimize=True, progressive=True)

    def og_tags_for(prefix):
        if not share:
            return ""
        og_url = f"{site_url}/og.jpg" if site_url else f"{prefix}og.jpg"
        return (f'<meta property="og:image" content="{esc(og_url)}">\n'
                '<meta property="og:image:width" content="1200">\n'
                '<meta property="og:image:height" content="630">\n'
                '<meta name="twitter:card" content="summary_large_image">')
    og_tags = og_tags_for("")
    canonical = ""
    if site_url:
        canonical = (f'<link rel="canonical" href="{esc(site_url)}/">\n'
                     f'<meta property="og:url" content="{esc(site_url)}/">')

    # Text sections.
    name = config.get("name", "Portfolio")
    # The logo and header mark are inlined so their slash can take the accent colour.
    logo_svg = (SRC / "logo.svg").read_text(encoding="utf-8").strip()
    mark_svg = (SRC / "mark.svg").read_text(encoding="utf-8").strip()
    about_html = "\n".join(f"<p>{esc(p)}</p>" for p in config.get("about", []) if p)
    services = [s for s in config.get("services", []) if s]
    services_html = ""
    if services:
        items = "".join(f"<li>{esc(s)}</li>" for s in services)
        services_html = f'<h3 class="services-title">What I shoot</h3><ul class="services">{items}</ul>'

    email = str(config.get("email") or "").strip()
    if not email:
        warn("email is empty in site.json, so there's no email link to show")
    links = []
    insta = str(config.get("instagram") or "").strip().lstrip("@")
    if insta:
        insta = insta.rstrip("/").split("/")[-1]
        links.append(f'<li><a href="https://www.instagram.com/{esc(insta)}/" rel="me noopener">'
                     f"Instagram @{esc(insta)}</a></li>")
    phone = str(config.get("phone") or "").strip()
    if phone:
        tel = re.sub(r"[^\d+]", "", phone)
        links.append(f'<li><a href="tel:{esc(tel)}">{esc(phone)}</a></li>')
    links_html = f'<ul class="contact-links">{"".join(links)}</ul>' if links else ""

    form_cfg = config.get("contact_form") or {}
    web3forms_key = str(form_cfg.get("web3forms_key") or "").strip()
    if not web3forms_key:
        warn("contact_form.web3forms_key is empty, so the contact form opens the visitor's "
             "email app instead of sending. Get a free key at web3forms.com.")
    has_contact_page = bool(web3forms_key or email or links)

    # Homepage strip: email, links, and a button to the full contact page.
    contact_parts = []
    if email:
        contact_parts.append(f'<a class="email" href="mailto:{esc(email)}">{esc(email)}</a>')
    if links_html:
        contact_parts.append(links_html)
    if has_contact_page:
        contact_parts.append('<p class="contact-cta"><a class="nav-cta" href="contact/">Send a message</a></p>')

    nav_style = str(config.get("nav_style") or "path").strip().lower()
    if nav_style not in ("path", "covers", "index"):
        warn(f"nav_style '{nav_style}' isn't one of path, covers or index; using path")
        nav_style = "path"

    payload = {
        "categories": data_categories,
        "videos": videos,
    }
    data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    data_json = data_json.replace("</", "<\\/")

    version = hashlib.sha1()
    for f in ("styles.css", "app.js", "contact.js", "theme.js", "motion.js", "logo.svg"):
        version.update((SRC / f).read_bytes())

    page = render((SRC / "index.html").read_text(encoding="utf-8"), {
        "title": esc(name),
        "name": esc(name),
        "description": esc(config.get("description", "")),
        "tagline": esc(config.get("tagline", "")),
        "logo_svg": logo_svg,
        "mark_svg": mark_svg,
        "theme_toggle": THEME_TOGGLE,
        "motion": "on" if config.get("motion", True) else "off",
        "about_html": about_html,
        "services_html": services_html,
        "contact_html": "\n".join(contact_parts),
        "contact_hidden": "" if has_contact_page or contact_parts else " hidden",
        "contact_link_hidden": "" if has_contact_page else " hidden",
        "nav_style": nav_style,
        "og_tags": og_tags,
        "canonical": canonical,
        "year": str(date.today().year),
        "version": version.hexdigest()[:8],
        "data_json": data_json,
    })
    (DIST / "index.html").write_text(page, encoding="utf-8")

    # The contact page lives at /contact/ so it has its own link to share.
    if has_contact_page:
        types = [t for t in form_cfg.get("shoot_types", []) if t] or ["Photos", "Video", "Something else"]
        chips = "".join(
            f'<span class="cp-chip"><input type="radio" name="shoot_type" id="t-{i}" value="{esc(t)}">'
            f'<label class="cat" for="t-{i}"><span class="sl" aria-hidden="true">/</span>{esc(t.lower())}</label></span>'
            for i, t in enumerate(types))
        budgets = '<option value="">Choose one</option>' + "".join(
            f'<option>{esc(b)}</option>' for b in form_cfg.get("budgets", []) if b)
        note = str(form_cfg.get("booking_note") or "").strip()
        note_html = (f'<p class="cp-note"><span class="sl" aria-hidden="true">/</span>{esc(note)}</p>'
                     if note else "")
        direct = []
        if email:
            direct.append('<h2 class="cp-direct-title">Prefer email?</h2>'
                          f'<a class="cp-direct-email" href="mailto:{esc(email)}">{esc(email)}</a>')
        elif links:
            direct.append('<h2 class="cp-direct-title">Other ways to reach me</h2>')
        if links_html:
            direct.append(links_html)
        faq = [f for f in config.get("faq", []) if f.get("q") and f.get("a")]
        faq_html = "".join(
            f'<details class="cp-q"><summary><span>{esc(f["q"])}</span>'
            f'<span class="cp-plus" aria-hidden="true"></span></summary>'
            f'<div class="cp-a"><p>{esc(f["a"])}</p></div></details>' for f in faq)
        contact_page = render((SRC / "contact.html").read_text(encoding="utf-8"), {
            "title": esc(name),
            "name": esc(name),
            "tagline": esc(config.get("tagline", "")),
            "mark_svg": mark_svg,
            "theme_toggle": THEME_TOGGLE,
            "og_tags": og_tags_for("../"),
            "reply_time": esc(form_cfg.get("reply_time") or "soon"),
            "booking_note_html": note_html,
            "web3forms_key": esc(web3forms_key),
            "email": esc(email),
            "shoot_types_html": chips,
            "budgets_html": budgets,
            "direct_html": "\n".join(direct),
            "faq_html": faq_html,
            "faq_hidden": "" if faq else " hidden",
            "year": str(date.today().year),
            "version": version.hexdigest()[:8],
        })
        (DIST / "contact").mkdir(exist_ok=True)
        (DIST / "contact" / "index.html").write_text(contact_page, encoding="utf-8")

    counts = ", ".join(f"{c['label']} {len(c['photos'])}" for c in data_categories)
    print(f"Built dist/ with {sum(len(c['photos']) for c in data_categories)} photo(s): {counts}"
          + (f", {len(videos)} video(s)" if videos else ""))
    if not any(c["photos"] for c in data_categories):
        warn("no photos found yet. Add some to the photos/ folders.")


def _safe_process(job):
    try:
        return process_photo(job)
    except Exception as exc:  # report the file and keep building the rest
        return f"{type(exc).__name__}: {exc}"


def serve():
    import functools
    import http.server
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    with http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler) as server:
        print("Preview at http://localhost:8000  (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    build()
    if "--serve" in sys.argv:
        serve()
