# Wpay Flask Backend

This backend is the Flask replacement for the previous Next.js API routes.

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m flask --app flask_app:app init-db
python3 -m flask --app flask_app:app run --port 5000
```

Local development uses SQLite at `instance/Wpay.sqlite3` unless
`DATABASE_URL` is set.

## Production PostgreSQL

Set `FLASK_ENV=production` and a PostgreSQL `DATABASE_URL`. The production
runtime rejects missing or non-PostgreSQL database URLs. Hosted `postgres://`
URLs are normalized to `postgresql://`.

## PythonAnywhere

1. Upload the project.
2. Install dependencies with `pip install -r requirements.txt`.
3. In the PythonAnywhere WSGI file, point to:

```python
import sys
path = "/home/YOUR_USERNAME/Wpay"
if path not in sys.path:
    sys.path.insert(0, path)

from flask_app import application
```

4. Add environment variables in the Web tab if needed:
   - `JWT_SECRET`
   - `DATABASE_URL`
   - `PUBLIC_APP_URL=https://www.sinzouae.com`
   - `COOKIE_SECURE=true` for HTTPS

Development admin credentials are `test21@gmail.com` / `test21@gmail.com`.
