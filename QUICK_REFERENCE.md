# Quick Reference - GlobalPay Platform

## 🚀 Quick Start Commands

### Start Backend
```bash
cd website
python flask_app.py
```
**Runs on:** `http://192.168.1.2:5000`

### Start Frontend
```bash
cd website
npm run dev
```
**Runs on:** `http://localhost:3000`

---

## 📍 Important URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Admin Dashboard | `http://localhost:3000/admin/dashboard` | Main admin panel |
| Activation Codes | `http://localhost:3000/admin/activation-codes` | Generate & manage codes |
| OTP Devices | `http://localhost:3000/admin/otp-devices` | Monitor devices |
| Backend API | `http://192.168.1.2:5000` | Flask REST API |

---

## 🔐 Default Login

```
Email: admin@wpay.com
Password: admin123
```

---

## 📱 Mobile App Configuration

**File:** `auto-otp/local.properties`
```properties
MONITORING_BASE_URL=http://192.168.1.2:5000
```
*Replace `192.168.1.2` with your computer's IP*

---

## 🔑 API Endpoints

### Public (No Auth)
```
POST /api/activation-codes/verify
POST /api/activation-codes/save-phone
POST /api/otp/report
```

### Admin (Requires Auth)
```
POST /api/admin/activation-codes/generate
GET  /api/admin/activation-codes
POST /api/admin/activation-codes/:id/reset
DELETE /api/admin/activation-codes/:id
GET  /api/admin/otp/devices
```

---

## 📦 Installation

### Python Requirements
```bash
pip install -r requirements.txt
```

**Contents:**
- Flask==3.0.0
- flask-cors==4.0.0
- python-dotenv==1.0.0
- SQLAlchemy==2.0.23
- Flask-SQLAlchemy==3.1.1
- Werkzeug==3.0.1
- bcrypt==4.1.2
- PyJWT==2.8.0
- requests==2.31.0

### Node.js Setup
```bash
cd website
npm install
```

---

## 🎯 Usage Flow

1. **Generate Code** → Admin panel → Activation Codes → Generate
2. **Copy Code** → 8-character code (e.g., `AB12CD34`)
3. **Install App** → Install APK on Android device
4. **Activate** → Enter code in app
5. **Verify Phone** → Enter phone number
6. **Monitor** → View device in admin panel

---

## 🛠️ Common Tasks

### Generate Activation Code
1. Go to: `http://localhost:3000/admin/activation-codes`
2. Enter optional notes
3. Click "Generate Code"
4. Copy the code

### Reset Device Access
1. Find code in activation codes table
2. Click "Reset" button
3. Confirm reset
4. Device will need new code

### View Device Status
1. Go to: `http://localhost:3000/admin/otp-devices`
2. See all activated devices
3. View phone numbers and telemetry

### Check Backend Logs
Terminal running `python flask_app.py`

### Check Frontend Logs
Terminal running `npm run dev`

### Check Mobile Logs
Android Studio → Logcat → Filter by "OTP"

---

## 🗄️ Database

**Location:** `website/instance/Wpay.sqlite3`

**Backup:**
```bash
cp website/instance/Wpay.sqlite3 website/instance/backup_$(date +%Y%m%d).sqlite3
```

**Reset:**
```bash
rm website/instance/Wpay.sqlite3
python flask_app.py  # Recreates database
```

---

## 🐛 Quick Fixes

### Backend Not Starting
```bash
pip install -r requirements.txt
```

### Frontend Not Starting
```bash
cd website
rm -rf node_modules package-lock.json
npm install
```

### Mobile App Network Error
1. Check `MONITORING_BASE_URL` in `local.properties`
2. Verify device and computer on same WiFi
3. Test: `curl http://YOUR_IP:5000`

### App Stops in Background
1. Settings → Apps → Auto OTP
2. Battery → Don't optimize
3. Background data → Allow

---

## 📊 File Structure

```
globalpay-shareable/
├── README.md              # Project overview
├── INSTALLATION.md        # Full installation guide
├── QUICK_REFERENCE.md     # This file
├── PROJECT_SUMMARY.md     # Feature summary
├── requirements.txt       # Python dependencies
├── .gitignore            # Git ignore rules
│
├── website/              # Frontend + Backend
│   ├── app/             # Next.js pages
│   ├── backend/         # Flask API
│   ├── components/      # React components
│   ├── instance/        # SQLite database
│   ├── flask_app.py     # Backend entry
│   └── package.json     # Node dependencies
│
└── auto-otp/            # Android app
    └── app/src/main/java/com/example/
        ├── MainActivity.kt
        ├── CodeVerificationScreen.kt
        └── ui/
            ├── PhoneSetupScreen.kt
            └── ConnectedScreen.kt
```

---

## 🔧 Environment Variables

### Backend (.env)
```env
FLASK_ENV=development
DATABASE_URL=sqlite:///instance/Wpay.sqlite3
SECRET_KEY=your-secret-key
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### Mobile (local.properties)
```properties
MONITORING_BASE_URL=http://192.168.1.2:5000
```

---

## 📞 Support Commands

### Check Python Version
```bash
python --version  # Should be 3.8+
```

### Check Node Version
```bash
node --version    # Should be 18+
npm --version
```

### Find Your IP Address
**Windows:**
```cmd
ipconfig
```
**Mac/Linux:**
```bash
ifconfig
# or
ip addr
```

### Test Backend
```bash
curl http://localhost:5000
```

### Test Frontend
Open in browser: `http://localhost:3000`

---

## 🎯 Key Features Checklist

- ✅ Device activation with unique codes
- ✅ Admin code generation and management
- ✅ Phone number verification
- ✅ OTP capture and forwarding
- ✅ Background service auto-restart
- ✅ Device reset functionality
- ✅ Real-time device monitoring
- ✅ Bilingual admin panel
- ✅ Dark mode support

---

## 🔗 Repository

**GitHub:** https://github.com/p1ng1ng/globalpay-shareable

**Clone:**
```bash
git clone https://github.com/p1ng1ng/globalpay-shareable.git
```

---

**Last Updated:** July 16, 2026  
**Version:** 1.0.0
