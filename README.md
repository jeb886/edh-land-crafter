# edh-land-crafter

A web app for crafting EDH/Commander mana bases. It has a lightweight Flask backend and a plain HTML/JS frontend with no build step.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
flask --app app run --debug
```

Open http://127.0.0.1:5000.

## Test

```bash
pytest
```

## Layout

- `app.py` — Flask app: serves `static/` and the `/api/*` endpoints
- `static/` — frontend (`index.html`, `app.js`, `style.css`)
- `tests/` — pytest tests
