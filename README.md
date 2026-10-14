# edh-land-crafter

A web app for crafting EDH/Commander mana bases. It's a static site (plain HTML/JS, no build step) that gets card data from the [Scryfall API](https://scryfall.com/docs/api) in the browser. It's hosted on GitHub Pages at https://jeb886.github.io/edh-land-crafter/.

## Run locally

Any static file server works. For example:

```bash
python3 -m http.server -d site 8000
```

Open http://localhost:8000.

## Test

Requires Node 20+ (no dependencies to install):

```bash
npm test
```

## Deploy

Each push to `main` runs `.github/workflows/pages.yml`, which runs the tests and then publishes `site/` to GitHub Pages. Pull requests run the tests only.

## Layout

- `site/`: the published site (`index.html`, `app.js`, `style.css`, `scryfall.js`)
- `tests/`: `node:test` unit tests
