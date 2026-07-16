# PythonAnywhere Quick Fix Guide

## 🔧 Fix "ModuleNotFoundError: No module named 'backend'"

### The Problem
Your directory structure is:
```
/home/v123113456/mysite/
├── website/
│   ├── flask_app.py          ← Flask app is here
│   └── backend/              ← Backend module is here
│       ├── __init__.py
│       ├── app.py
│       ├── routes.py
│       └── ...
```

But your WSGI file is pointing to `/home/v123113456/mysite/` instead of `/home/v123113456/mysite/website/`

---

## ✅ Solution: Update WSGI File

### Step 1: Go to Web Tab
1. Login to PythonAnywhere
2. Click **Web** tab
3. Click on your web app
4. Find **WSGI configuration file** section
5. Click the link to edit

### Step 2: Replace WSGI Content

**Replace the entire content with this:**

```python
import sys
import os

# The website directory contains flask_app.py and backend/
project_home = '/home/v123113456/mysite/website'

# Add the website directory to Python path
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Change working directory
os.chdir(project_home)

# Import Flask application
from flask_app import app as application
```

### Step 3: Save and Reload

1. Click **Save** (top right or Ctrl+S)
2. Go back to **Web** tab
3. Click the big green **Reload** button
4. Wait for reload to complete

---

## ✅ Verify Setup

Visit: `https://v123113456.pythonanywhere.com`

You should see your Flask app running!

---

## 🗂️ File Locations on PythonAnywhere

Make sure your files are in these exact locations:

```
/home/v123113456/mysite/website/
├── flask_app.py
├── backend/
│   ├── __init__.py
│   ├── app.py
│   ├── config.py
│   ├── routes.py
│   ├── models.py
│   ├── auth.py
│   ├── extensions.py
│   └── ... (other backend files)
├── instance/
│   └── Wpay.sqlite3 (will be created automatically)
└── .env (create this file)
```

---

## 🔑 Create .env File

In `/home/v123113456/mysite/website/.env`:

```bash
FLASK_ENV=production
DATABASE_URL=sqlite:///instance/Wpay.sqlite3
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-here
CORS_ORIGINS=*
AUTO_INIT_DB=true
```

Generate secret keys in console:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 📝 Summary of Changes

**What was wrong:**
- WSGI file pointed to `/home/v123113456/mysite/`
- But `backend/` folder is in `/home/v123113456/mysite/website/`
- Python couldn't find the `backend` module

**What we fixed:**
- Changed `project_home` to `/home/v123113456/mysite/website/`
- Now Python can find `backend/` folder
- Imports work correctly

---

## 🎯 After Fix

Your app should now:
- ✅ Load without import errors
- ✅ Create database automatically
- ✅ Respond to API requests
- ✅ Allow admin login
- ✅ Work with mobile app

---

## 📞 Still Having Issues?

1. Check error logs in Web tab
2. Make sure all files are uploaded
3. Verify dependencies are installed
4. Confirm Python version is 3.13+
5. Check that `.env` file exists

---

**Quick Command Summary:**

```bash
# Navigate to project
cd /home/v123113456/mysite

# Check if files exist
ls -la website/flask_app.py
ls -la website/backend/

# Install dependencies
pip install --user -r requirements-pythonanywhere.txt

# Test import manually
cd website
python3 -c "from backend.app import create_app; print('SUCCESS')"
```

---

**This should fix your import error! 🎉**
