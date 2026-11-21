# The landing page

The public front door of FitzyClub, at the root of the main address (`https://fitzyclub.in/`). It is plain HTML, CSS and a little
JavaScript in `backend/public/landing/`, served by the same server as the app. No build step.

## Who sees it

- **Visitors on the main address** see it at `/`.
- **A gym's own address** (`iron.fitzyclub.in`) never does: it goes straight to the app, as before.
- **Someone already signed in** is sent on to `/dashboard` before the page paints (the app leaves a harmless flag in the
  browser; see `redirect.js`). Add `?home` to the address to look at the page anyway.
- Installed staff apps open at `/dashboard`.

## Filling in what only you can supply

Edit **`backend/public/landing/config.js`**. Anything left empty hides that part of the page, so nothing half-finished shows.

| Setting | Effect |
|---|---|
| `whatsapp` | A round chat button and a footer link. Country code, digits only (`919876543210`). |
| `email` | Footer link and an "Ask a question" button. |
| `social.*` | One icon each in the footer (YouTube, Instagram, Facebook, LinkedIn, X). Full `https://` links. |
| `videos.main`, `videos.more` | The "See it working" section and the Demo menu link. YouTube video ids. |
| `testimonials` | The "What gym owners say" section. **Real quotes only.** |
| `stats` | A strip of real numbers under the hero. |
| `company` | Name and address in the footer. |

Videos load only when clicked, from `youtube-nocookie.com`, so nothing is sent to YouTube until a visitor presses play.

## Pricing

Read live from the packages you set up in Platform admin (the same list the sign-up page shows), so a price change appears on
the page without touching it. If sign-up is closed, or the list cannot be loaded, the page shows a single "Start free trial" card.
Each plan links to `/signup?package=<id>` and the sign-up page preselects it.

## Screenshots

`backend/public/landing/img/` holds three product screenshots of a fictional demo gym. Regenerate them when the app changes:

```bash
npm run build --prefix frontend
cd e2e
node landing-screenshots.js
```

This starts a throwaway server on a database whose name ends in `-test`, adds demo members, payments and expenses through the real
API, and photographs the owner dashboard, the new-member welcome card and the member app.

## Security notes

- The page uses no inline scripts and no third-party scripts. The security policy allows one outside frame, the YouTube player.
- The page sends `Referrer-Policy: strict-origin-when-cross-origin` (the app sends none) because YouTube needs to know the embedding site.
- `robots.txt` lets search engines index the main address and keeps them out of gym addresses, `/api` and the member app.
  `sitemap.xml` lists the public pages.
- There is no analytics or tracking. If you add some later, add it to the privacy policy first.
