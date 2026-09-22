# Trading journal

A personal trading journal that runs as a website and installs like an app on phone and desktop.

- Frontend: plain HTML, CSS and JavaScript (no build step), hosted on GitHub Pages
- Backend: Google Apps Script Web app
- Database: Google Sheets
- Screenshots: ImgBB (arrives in a later build)

This is version 0.2.0.

- Sign in, several USD accounts, light and dark themes, offline-first sync, installable app
- Instruments with contract sizes you enter yourself, and strategies
- **Log, edit, close and delete trades** for Forex, Crypto, Indices and Commodities, with lots, leverage, margin, risk, reward to risk, result and R multiple worked out as you type
- **Size from risk:** enter a risk percentage and get the lot size
- Trades list with search and filters, trade detail page, recent trades on the dashboard

The calendar, screenshots, analytics and recommendations arrive in the next builds.

## Publish it on GitHub Pages

1. On github.com choose **New repository**. Name it `trading-journal` and set it to **Public** (GitHub Pages on a free plan needs a public repository). Nothing secret is stored in this code: your Web app URL and passphrase are typed on the login screen and kept only on your device.
2. Unzip this download. In the new repository choose **Add file, Upload files**, then drag in everything inside the unzipped folder (`index.html`, `manifest.json`, `service-worker.js`, and the `assets` and `js` folders). `index.html` must sit at the top level of the repository. Choose **Commit changes**.
3. Open **Settings, Pages**. Under **Build and deployment** choose **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder, and save.
4. After a minute your journal is live at `https://YOUR-USERNAME.github.io/trading-journal/`.

## First sign in

Open the page, paste your Apps Script **Web app URL** (it ends in `/exec`) and your passphrase. Do this once on each device.

## Install it as an app

- **Android (Chrome):** menu, then Install app or Add to Home screen
- **iPhone (Safari):** Share, then Add to Home Screen
- **Desktop (Chrome or Edge):** install icon at the right end of the address bar

## Updating from an earlier version

Upload the new files over the old ones: on your repository choose **Add file, Upload files**, drag in `index.html`, `manifest.json`, `service-worker.js` and the `assets` and `js` folders (drag the folders themselves, not the "choose your files" link), and commit. Files with the same name are replaced and new ones are added. Then reload the app twice.

## Updating the code later

Upload the changed files to the repository (same folder structure). The app caches its files so it can open offline, so also change `CACHE_VERSION` in `service-worker.js` (for example `v1` to `v2`) in the same commit. Devices pick up the new version the next time they open the app, sometimes after a second reload.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `manifest.json`, `service-worker.js` | Page, install details, offline cache |
| `assets/styles.css` | All styling, light and dark themes |
| `js/main.js` | Start-up and routes |
| `js/api.js` | Talks to the Apps Script backend |
| `js/db.js` | Local storage in the browser (IndexedDB) |
| `js/sync.js` | Saves changes locally first, then sends them to the Sheet; pulls fresh data |
| `js/store.js`, `js/router.js`, `js/util.js`, `js/calc.js`, `js/config.js` | State, navigation, helpers, calculations, settings |
| `js/ui/*` | Screens and dialogs |

## Troubleshooting

- **"That passphrase was not accepted":** check the passphrase. After 10 wrong attempts the backend pauses for 10 minutes.
- **"The URL did not answer like the journal backend":** use the URL of the latest deployment, and make sure access is set to Anyone.
- **Changes do not appear after an update:** bump `CACHE_VERSION` and reload twice.
