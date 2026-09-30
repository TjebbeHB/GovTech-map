# GovTech map · DigiCampus

**Live website: [govtechmap.tjebbe-boersma.com](https://govtechmap.tjebbe-boersma.com/)**

A Dutch-language discovery portal for public digital innovation: explore solutions, organisations, collaborations, geographic maps and sourced relationships.

This repository contains the self-contained public edition deployed on Vimexx, including editable HTML/CSS/JavaScript, public catalogue data, locally served fonts and vendor assets. It runs without the Mac mini or an application server.

## Included

- 413 catalogue entries: 62 solutions, 292 organisations and 59 collaborations.
- Search, filters, organisation profiles, interactive maps and relationship networks.
- Public JSON, CSV and GeoJSON downloads, with source references.
- Responsive layouts and a service worker for offline application assets; map tiles need internet.

The suggestion form is currently disabled. Its private submission backend has not yet been connected to this edition. The research workbooks, private submissions, internal database/build pipeline and hosting credentials are not included.

## Run locally

Use Python 3 to serve only the public folder:

```sh
python3 -m http.server 8080 --directory web
```

Open [localhost:8080](http://localhost:8080). No npm install, API key or database is needed.

## Edit and test

Edit the source files in `web/`. The homepage is `web/index.html`; the map/network view is `web/atlas.html`. Public data is in `web/data/`. Preserve source references when changing catalogue entries and keep the catalogue and ecosystem datasets consistent.

Run the frontend unit tests with a recent Node.js version:

```sh
node --test tests/*.test.mjs
```

After changes, check search, map navigation, details, downloads and mobile layout. Update the cache version in `web/sw.js` when publishing changed assets.

## Deploy

Upload the **contents of `web/`**, including `.htaccess`, to the intended hosting document root. Back up replaced files first; upload assets/data before HTML and the service worker. Enable HTTPS and serve `.mjs` as `application/javascript` (the included Apache configuration handles MIME types).

GitHub stores the project; the active website is hosted separately on Vimexx. Pushing here does not automatically update the website.

## Credits and rights

Ontwikkeld door Tjebbe Boersma, met ondersteuning van OpenAI Codex, voor DigiCampus

Third-party licenses and notices are retained in `web/vendor/`; brand provenance is documented in [BRAND-ASSETS.md](web/brand/BRAND-ASSETS.md). No open-source license has yet been selected for the original project code. DigiCampus branding, map tiles and source datasets have separate rights; their inclusion does not grant a general reuse license.
