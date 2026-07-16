# PythonAnywhere Deployment Guide

## 🌐 Deploying GlobalPay to PythonAnywhere

### Step 1: Upload Files

1. Login to PythonAnywhere: https://www.pythonanywhere.com
2. Go to **Files** tab
3. Upload or clone the repository to `/home/YOUR_USERNAME/mysite/`

**Or clone via console:**
```bash
cd ~
git clone https://github.com/p1ng1ng/globalpay-shareable.git mysite
```

---

### Step 2: Install Dependencies

Open a **Bash console** and run:

```bash
cd ~/mysite
pip install --user -r requirements-pythonanywhere.txt
```

**Note:** Use `requirements-pythonanywhere.txt` as it's compatible with PythonAnywhere's pre-installed packages (dash, pyopenssl).

---

### Step 3: Configure WSGI File

1. Go to **Web** tab
2. Click on your web app
3. Click on **WSGI configuration file** link
4. Replace content with:

```python
import sys
import os

# Add your project directory to sys.path
project_home = '/home/YOUR_USERNAME/mysite'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set up environment
os.chdir(project_home)

# Import Flask app
from flask_app import app as application
```

**Replace `YOUR_USERNAME` with your PythonAnywhere username!**

---

### Step 4: Configure Environment Variables

Create `/home/YOUR_USERNAME/mysite/.env`:

```bash
FLASK_ENV=production
DATABASE_URL=sqlite:///instance/Wpay.sqlite3
SECRET_KEY=your-random-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here
CORS_ORIGINS=*
AUTO_INIT_DB=true
```

**Generate secret keys:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

### Step 5: Set Python Version

1. In **Web** tab
2. Find **Python version** section
3. Select **Python 3.13** or latest available

---

### Step 6: Reload Web App

1. In **Web** tab
2. Click the big green **Reload** button
3. Wait for reload to complete

---

### Step 7: Test Your App

Visit: `https://YOUR_USERNAME.pythonanywhere.com`

**Test endpoints:**
- Home: `https://YOUR_USERNAME.pythonanywhere.com/`
- API health: `https://YOUR_USERNAME.pythonanywhere.com/api/health`
- Admin login: Navigate to Next.js frontend (separate deployment)

---

## 🔧 Directory Structure

Your PythonAnywhere setup should look like:

```
/home/YOUR_USERNAME/mysite/
├── website/
│   ├── backend/
│   │   ├── __init__.py
│   │   ├── app.py
│   │   ├── routes.py
│   │   ├── models.py
│   │   ├── auth.py
│   │   └── ... (other backend files)
│   ├── instance/
│   │   └── Wpay.sqlite3 (created automatically)
│   └── .env
├── flask_app.py
├── requirements.txt
└── requirements-pythonanywhere.txt
```

---

## 🗄️ Database Setup

Database will be created automatically at `/home/YOUR_USERNAME/mysite/website/instance/Wpay.sqlite3`

**To manually initialize:**
```bash
cd ~/mysite
python3 -c "from flask_app import app; app.app_context().push(); from backend.extensions import db; db.create_all()"
```

---

## 🐛 Troubleshooting

### Error: "ImportError: attempted relative import with no known parent package"

**Fixed!** The codebase now uses absolute imports (`backend.module`) instead of relative imports (`.module`).

### Error: "No module named 'backend'"

**Solution:** Make sure `sys.path.insert(0, project_home)` is in your WSGI file.

### Error: "Database is locked"

**Solution:** SQLite can have issues with multiple workers. In **Web** tab, set workers to 1.

### Error: Dependency conflicts with dash

**Solution:** Use `requirements-pythonanywhere.txt` which has compatible version constraints:
```bash
pip install --user -r requirements-pythonanywhere.txt
```

### Check Error Logs

1. Go to **Web** tab
2. Scroll down to **Log files**
3. Click on **Error log** link
4. Check for errors

### Reload After Changes

Always click **Reload** button in Web tab after:
- Changing code
- Installing packages
- Modifying WSGI file
- Updating environment variables

---

## 📝 WSGI Configuration Template

**Full WSGI file** (`/var/www/YOUR_USERNAME_pythonanywhere_com_wsgi.py`):

```python
"""
WSGI config for GlobalPay Flask backend on PythonAnywhere.

This configuration:
1. Adds project directory to Python path
2. Changes to project directory
3. Imports the Flask application
"""

import sys
import os

# Replace with your actual PythonAnywhere username
USERNAME = 'YOUR_USERNAME'

# Add project directory to sys.path
project_home = f'/home/{USERNAME}/mysite'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Change to project directory for relative paths
os.chdir(project_home)

# Import Flask application
# This works because flask_app.py is in project_home
from flask_app import app as application

# Optional: Add some debugging info
print(f"WSGI: Python path includes: {project_home}")
print(f"WSGI: Working directory: {os.getcwd()}")
print(f"WSGI: Application loaded successfully")
```

---

## 🔐 Security Checklist

- ✅ Change default admin password (`admin@wpay.com` / `admin123`)
- ✅ Set strong `SECRET_KEY` and `JWT_SECRET_KEY`
- ✅ Don't commit `.env` to git
- ✅ Use HTTPS (automatic on PythonAnywhere)
- ✅ Configure CORS properly (don't use `*` in production)

---

## 🚀 Mobile App Configuration

Update mobile app's `local.properties`:

```properties
MONITORING_BASE_URL=https://YOUR_USERNAME.pythonanywhere.com
```

Rebuild APK and reinstall on device.

---

## 📊 Deployment Checklist

- [ ] Files uploaded to `/home/YOUR_USERNAME/mysite/`
- [ ] Dependencies installed with `requirements-pythonanywhere.txt`
- [ ] WSGI file configured with correct path
- [ ] Environment variables set in `.env`
- [ ] Python version selected (3.13+)
- [ ] Web app reloaded
- [ ] Database created automatically
- [ ] Admin login works
- [ ] API endpoints respond
- [ ] Mobile app configured with PythonAnywhere URL
- [ ] Default admin password changed

---

## 🔗 Useful PythonAnywhere Links

- **Dashboard**: https://www.pythonanywhere.com/user/YOUR_USERNAME/
- **Web tab**: https://www.pythonanywhere.com/user/YOUR_USERNAME/webapps/
- **Files tab**: https://www.pythonanywhere.com/user/YOUR_USERNAME/files/
- **Consoles tab**: https://www.pythonanywhere.com/user/YOUR_USERNAME/consoles/
- **Help**: https://help.pythonanywhere.com/

---

## 📞 Support

If you encounter issues:
1. Check error logs in Web tab
2. Review PythonAnywhere help docs
3. Verify all paths are correct in WSGI file
4. Ensure all dependencies are installed
5. Check Python version compatibility

---

**Deployment Status:** Ready for production! 🎉

**Last Updated:** July 16, 2026
