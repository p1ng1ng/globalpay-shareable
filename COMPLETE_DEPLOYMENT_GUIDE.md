# 🚀 Complete Deployment Guide

## Part 1: PythonAnywhere (Backend API)

### 📦 Files to Upload

Upload ALL files from this folder to PythonAnywhere:
```
C:\Users\ASUS\Downloads\globalpay-shareable\pythonanywhere-ready\
```

**Upload these 15 Python files to `/home/v123113456/mysite/`:**

1. ✅ `flask_app.py`
2. ✅ `app.py`
3. ✅ `routes.py`
4. ✅ `models.py`
5. ✅ `auth.py`
6. ✅ `config.py`
7. ✅ `extensions.py`
8. ✅ `alosheell.py`
9. ✅ `rockypayz.py`
10. ✅ `rupayex.py`
11. ✅ `merchant_webhooks.py`
12. ✅ `gateway_http.py`
13. ✅ `credential_crypto.py`
14. ✅ `wsgi.py`
15. ✅ `__init__.py`

### 🔧 PythonAnywhere Setup

#### Step 1: Upload Files
```bash
# In PythonAnywhere Files tab
# Go to /home/v123113456/mysite/
# Upload all 15 .py files from pythonanywhere-ready folder
```

#### Step 2: WSGI Configuration
Edit `/var/www/v123113456_pythonanywhere_com_wsgi.py`:

```python
import sys
import os

project_home = '/home/v123113456/mysite'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

os.chdir(project_home)

from flask_app import app as application
```

#### Step 3: Create .env File
Create `/home/v123113456/mysite/.env`:

```env
FLASK_ENV=production
DATABASE_URL=sqlite:///instance/Wpay.sqlite3
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-here
CORS_ORIGINS=*
AUTO_INIT_DB=true
```

Generate secrets:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

#### Step 4: Install Dependencies
```bash
cd /home/v123113456/mysite
pip install --user Flask flask-cors python-dotenv SQLAlchemy Flask-SQLAlchemy Werkzeug bcrypt PyJWT requests psycopg2-binary pyotp qrcode[pil] cryptography
```

#### Step 5: Reload Web App
- Go to Web tab
- Click green "Reload" button

✅ **Backend URL:** https://v123113456.pythonanywhere.com

---

## Part 2: Vercel (Frontend Dashboard)

### 📦 What to Deploy

Deploy the **website** folder from:
```
C:\Users\ASUS\Downloads\globalpay-shareable\website\
```

This folder contains:
- ✅ Next.js app (app/, components/, lib/)
- ✅ package.json
- ✅ next.config.mjs
- ✅ tailwind.config.ts
- ✅ tsconfig.json

**DO NOT include:**
- ❌ `backend/` folder (already on PythonAnywhere)
- ❌ `instance/` folder (database - stays on PythonAnywhere)
- ❌ `flask_app.py` (backend only)

### 🚀 Vercel Deployment

#### Method 1: Vercel CLI (Recommended)

**Step 1: Install Vercel CLI**
```bash
npm install -g vercel
```

**Step 2: Navigate to website folder**
```bash
cd C:\Users\ASUS\Downloads\globalpay-shareable\website
```

**Step 3: Deploy**
```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- What's your project's name? **globalpay-dashboard**
- In which directory is your code located? **.**
- Want to override the settings? **N**

#### Method 2: Vercel Web UI

**Step 1: Push to GitHub**
```bash
cd C:\Users\ASUS\Downloads\globalpay-shareable
git add .
git commit -m "Prepare for Vercel deployment"
git push origin master
```

**Step 2: Import on Vercel**
1. Go to https://vercel.com
2. Click "Add New" → "Project"
3. Import from GitHub: `globalpay-shareable`
4. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `website`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
   - **Install Command:** `npm install`

**Step 3: Environment Variables**
Add these in Vercel project settings:

```env
NEXT_PUBLIC_API_URL=https://v123113456.pythonanywhere.com
NODE_ENV=production
```

**Step 4: Deploy**
Click "Deploy" button

### 📋 Vercel Configuration

**Build Settings:**
- **Build Command:** `npm run build`
- **Output Directory:** `.next`
- **Install Command:** `npm install`
- **Development Command:** `npm run dev`
- **Root Directory:** `website`

**Node.js Version:** 18.x or higher

### 🔧 Update API URL in Frontend

After deployment, update the API URL:

**File:** `website/lib/api.ts` or wherever you make API calls

```typescript
// Change from localhost to PythonAnywhere URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://v123113456.pythonanywhere.com';
```

---

## Part 3: Mobile App Configuration

The Android app (`auto-otp/`) stays local - you build APK and install on device.

**Update:** `auto-otp/local.properties`

```properties
MONITORING_BASE_URL=https://v123113456.pythonanywhere.com
```

**Build APK:**
```bash
cd auto-otp
./gradlew assembleDebug
```

APK location: `auto-otp/app/build/outputs/apk/debug/app-debug.apk`

---

## 📁 Complete File Structure Summary

```
globalpay-shareable/
│
├── pythonanywhere-ready/          ← Upload these to PythonAnywhere
│   ├── flask_app.py
│   ├── app.py
│   ├── routes.py
│   ├── models.py
│   └── ... (all backend .py files)
│
├── website/                        ← Deploy this to Vercel
│   ├── app/                       ← Next.js pages
│   ├── components/                ← React components
│   ├── lib/                       ← Utilities
│   ├── public/                    ← Static files
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
└── auto-otp/                       ← Build APK locally
    ├── app/src/
    ├── build.gradle
    └── local.properties (update URL)
```

---

## ✅ Deployment Checklist

### PythonAnywhere (Backend)
- [ ] Upload 15 .py files to `/home/v123113456/mysite/`
- [ ] Configure WSGI file
- [ ] Create `.env` file with secrets
- [ ] Install Python dependencies
- [ ] Reload web app
- [ ] Test: https://v123113456.pythonanywhere.com
- [ ] Verify API endpoints work

### Vercel (Frontend)
- [ ] Push code to GitHub
- [ ] Import project on Vercel
- [ ] Set root directory to `website`
- [ ] Configure build settings
- [ ] Add environment variables
- [ ] Deploy
- [ ] Test: Your Vercel URL
- [ ] Verify admin panel works

### Mobile App
- [ ] Update `MONITORING_BASE_URL` to PythonAnywhere URL
- [ ] Build APK
- [ ] Install on device
- [ ] Test activation flow
- [ ] Test OTP capture

---

## 🔗 Your URLs After Deployment

| Service | URL | Purpose |
|---------|-----|---------|
| **Backend API** | https://v123113456.pythonanywhere.com | Flask REST API |
| **Frontend** | https://your-project.vercel.app | Admin Dashboard |
| **Mobile App** | APK on device | OTP Monitoring |

---

## 🐛 Common Issues

### Issue: Vercel can't find Next.js app
**Solution:** Set root directory to `website` in project settings

### Issue: API calls fail from frontend
**Solution:** Add CORS headers in Flask and update `NEXT_PUBLIC_API_URL`

### Issue: Build fails on Vercel
**Solution:** Check Node.js version (need 18+) and ensure all dependencies in package.json

---

## 📞 Quick Commands Reference

### PythonAnywhere
```bash
# Install dependencies
pip install --user Flask flask-cors python-dotenv SQLAlchemy Flask-SQLAlchemy Werkzeug bcrypt PyJWT requests psycopg2-binary pyotp qrcode[pil] cryptography

# Test import
python3 -c "from flask_app import app; print('SUCCESS')"
```

### Vercel
```bash
# Deploy with CLI
cd website
vercel

# Or production deployment
vercel --prod
```

### Mobile App
```bash
# Build APK
cd auto-otp
./gradlew assembleDebug
```

---

## 🎉 Success Criteria

When everything works:
- ✅ PythonAnywhere returns JSON from API endpoints
- ✅ Vercel shows admin dashboard
- ✅ Admin can login at Vercel URL
- ✅ Admin can generate activation codes
- ✅ Mobile app connects to PythonAnywhere
- ✅ Mobile app can verify activation codes
- ✅ OTP messages appear in dashboard

---

**You're almost done! Just follow these steps and you'll be live! 🚀**
