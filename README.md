# Chief Ray portfolio

A photo and video portfolio that builds and publishes itself on GitHub Pages for free.
You drop photos into folders on GitHub, and about a minute later they're on the site:
resized, sorted into categories, with GPS and other metadata stripped.

```
photos/street/        your street photos
photos/people/        portraits
photos/landscapes/    landscapes
photos/business/      menus, listings, client work
photos/bw/            black and white photos (any subject)
photos/film/          film-look photos (any subject)
site.json             your name, about text, email, Instagram, videos
src/                  the page design (HTML, CSS, JS, fonts)
build.py              resizes photos and assembles the site
.github/workflows/    tells GitHub to run build.py and publish
```

## One-time setup (about 10 minutes)

1. **Create the repo.** On GitHub, click **New repository**. Name it
   `YOUR-USERNAME.github.io` so the site lives at `https://YOUR-USERNAME.github.io`
   (any other name puts it at `https://YOUR-USERNAME.github.io/REPO-NAME/`).
   It must be **Public** on a free account. Don't add a README.
2. **Upload the files.** On the new repo's page, click **uploading an existing file**.
   Unzip this folder, open it, select everything inside (including the `.github`
   folder) and drag it in. Click **Commit changes**.
   - On a Mac, Finder hides `.github`. Press **Cmd + Shift + .** to show it before selecting.
3. **Turn on Pages.** Go to **Settings → Pages**. Under *Build and deployment*,
   set **Source** to **GitHub Actions**.
4. **Run the first build.** Go to the **Actions** tab, click **Build and publish site**,
   then **Run workflow**. When it goes green (1–2 minutes), your site is live.

If the Actions tab shows no workflow, the `.github` folder didn't upload. Click
**Add file → Create new file**, type `.github/workflows/deploy.yml` as the name,
paste in the contents of that file from the zip, and commit.

## Fill in your details

Click `site.json` on GitHub, then the pencil icon, edit, and commit. The site rebuilds automatically.

| Field | What it does |
|---|---|
| `email` | **Fill this in.** The Contact section stays hidden until you do. |
| `instagram` | Your handle, without the @. |
| `phone` | Optional. Leave `""` to hide it. |
| `tagline` | The line under the logo. |
| `about` | Your bio. One quoted string per paragraph. The text in there is a draft, so rewrite it in your own words. |
| `services` | The "What I shoot" list. |
| `site_url` | Your domain, `"https://chiefraystudio.com"`. Makes link previews on Instagram and iMessage show your photo. |
| `share_photo` | Which photo shows in link previews, e.g. `"street/03-gastown.jpg"`. Defaults to your first photo. |
| `motion` | `true` for the logo intro, the autofocus animation and the fade on scroll. `false` for a still site. |
| `nav_style` | How categories are shown: `"path"` (big /street /people words under the logo), `"covers"` (a photo card per category) or `"index"` (a list beside the gallery). |
| `show_camera_settings` | Shows camera, focal length, aperture, shutter and ISO in the viewer. `false` to hide. |
| `categories` | Rename a tab with `label`, or add a category: add a line here and create the matching folder under `photos/`. Add `"cover": "03-gastown.jpg"` to pick the photo on that category's cover card (otherwise the first photo is used). |
| `videos` | YouTube links, e.g. `{ "url": "https://youtu.be/XXXX", "title": "Promo reel" }`. Adds a Video tab. Shorts links show as vertical. |

## The contact page

The site has a contact page at `/contact/` with a short form, optional extra
details, and a questions section. Messages are delivered to your inbox by
[Web3Forms](https://web3forms.com) (free for up to 250 messages a month).

1. Go to web3forms.com, enter the email you want messages sent to, and they'll
   email you an access key.
2. Paste it into `site.json` under `contact_form` → `web3forms_key`. The key is
   meant to sit in the page, so that's safe.
3. Send yourself a test message from the live site.

Until a key is added, the form opens the visitor's own email app with their
message filled in, so nothing is lost.

What you can change in `site.json`:

| Field | What it does |
|---|---|
| `contact_form.reply_time` | Shown as "I reply ___". |
| `contact_form.booking_note` | The line under the heading. Set to `""` to hide it. |
| `contact_form.shoot_types` | The options under "What do you need?". |
| `contact_form.budgets` | The budget dropdown in "Add details". |
| `faq` | The questions and answers. **The answers in there are drafts. Rewrite them with your real prices, travel area and turnaround before going live.** |

Spam: a hidden field that only bots fill in blocks most junk. If spam still
gets through, Web3Forms can add a captcha.

## Adding photos

**Export first.** Don't upload straight off the camera. In your editor's export settings:

- Long edge **2560 px**, JPEG quality around **80**, colour space **sRGB**
- Turn on **Remove location info** (Lightroom has this checkbox under Metadata).
  The site strips GPS from what it publishes, but your repo is public and anyone
  can download the files you upload. The build log warns you if a photo still has GPS in it.
- Keep camera info in the metadata if you want the viewer to show your settings.

**Upload.** On GitHub, open `photos/street` (or another folder) → **Add file → Upload files**
→ drag photos in → **Commit changes**. The site updates in about a minute.

- **Which folder:** colour photos go in their subject folder (street, people, landscapes,
  business). Black and white photos go in `bw`, film-look photos in `film`, whatever the
  subject. Each photo goes in one folder only. A category with no photos stays hidden.
- **Order:** photos sort by filename, so prefix them: `01-…`, `02-…`. The *All* tab mixes categories together.
- **Captions:** a descriptive filename becomes the caption. `03-gastown-in-the-rain.jpg`
  shows as "Gastown in the rain". Camera names like `DSC01234.jpg` get no caption.
- **Remove a photo:** open it on GitHub → **⋯ → Delete file**.
- **Share one category:** links like `yoursite.com/#/business` open straight to that tab,
  which is handy when pitching a restaurant. Each photo in the viewer has its own link too.

Phones work too: GitHub's mobile site supports uploads the same way.

## Using your own domain

The domain is `chiefraystudio.com`, registered at Cloudflare. Do these in order.

1. **Verify it on GitHub first.** Your GitHub profile (not the repo) → **Settings → Pages →
   Add a domain** → enter `chiefraystudio.com`. GitHub shows a **TXT** record; add it in
   Cloudflare under **DNS → Records**, then click **Verify** on GitHub. This stops anyone
   else from pointing the domain at their own GitHub site.
2. **Point the domain at GitHub.** In Cloudflare **DNS → Records**, add:

   | Type | Name | Content |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `YOUR-USERNAME.github.io` |

   Set **Proxy status** to **DNS only** (grey cloud) on all five. With the orange cloud on,
   GitHub can't issue your HTTPS certificate.
   Leave the MX and TXT records that Email Routing added alone.
3. **Connect it.** In the repo, **Settings → Pages → Custom domain** → `chiefraystudio.com` →
   **Save**. Once the DNS check passes, tick **Enforce HTTPS** (can take up to a day).
4. `site_url` in `site.json` is already set to `https://chiefraystudio.com`.

## Previewing on your computer (optional)

Needs Python 3. Then:

```
pip install -r requirements.txt
python build.py --serve
```

and open http://localhost:8000. Not required, since GitHub builds the site for you.

## Limits worth knowing

- GitHub Pages: about 1 GB for the repo and 100 GB of traffic a month, free.
  At 2560 px exports (~1 MB each), that fits several hundred photos.
  Deleted photos stay in the repo's history, so exporting small from the start matters.
- GitHub's terms are aimed at portfolios and project sites, not online stores. If you
  ever add booking or payments, move to another static host. The built `dist/` folder
  is plain files and works anywhere.
- RAW files (.ARW) and HEIC can't be shown on the web. The build skips them and tells you.

## Logo and colours

- The big logo at the top is `src/logo.svg`; the small f/ in the header is `src/mark.svg`.
  Both are outlines, so they look the same everywhere with no font to load.
- The accent colour (the slashes, the Contact button) is `--accent` near the top of
  `src/styles.css`: Safelight `#ee6a43`. `--ray` is the same orange for focus rings and
  underlines (a deeper orange in light mode so they stay easy to see).
- **Logo motion.** When the page opens, the logo plays a "viewfinder" intro: framing
  guides appear, the letters drop in, the screen blinks like a shutter. After that, every
  7 seconds (and whenever someone taps the logo) it does an "autofocus": the word blurs,
  the focus brackets hunt, then it snaps sharp. Content also fades in and out as you
  scroll. All of this lives in `src/motion.js`; set `"motion": false` in `site.json` to
  turn it off. It's also off for visitors whose phone is set to reduce motion.
- `src/logo.svg` has one shape per letter so the letters can move; it looks identical
  to the logo in the logo pack.
- **Dark and light mode.** The site follows the visitor's phone or computer setting, and
  the round sun/moon button in the header switches it (remembered on that device).
  Dark mode is charcoal; light mode is soft blush with category highlighters in shades
  of the Safelight colour. Both sets of colours are at the top of `src/styles.css`.
  The photo viewer stays dark in both, since photos are judged on grey.
- `src/favicon.svg` is the browser tab icon; `src/apple-touch-icon.png` is the icon
  an iPhone uses when someone saves your site to their home screen.
- The full logo pack (PNGs, black and white versions, Instagram avatar,
  Lightroom watermark) is a separate download.

## Credits

The logo and the whole site use one typeface, TeX Gyre Adventor (Bold for headings,
links and buttons, Regular for reading text). It's under the GUST Font License
(see `src/fonts/`), which allows commercial use. No outside scripts, trackers or font services.
