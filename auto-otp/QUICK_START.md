# 🚀 Quick Start Guide - Auto OTP Monitoring System

## 1. Start Backend (30 seconds)

```bash
cd backend
python app.py
```

**Expected Output**:
```
✅ Default user created: test21@gmail.com
🚀 Auto OTP Backend Server Starting...
📡 Server running on: http://0.0.0.0:5000
```

**Backend is now running!** ✅

---

## 2. Install Mobile App (30 seconds)

```bash
# Already built! Just install:
adb install -r app\build\outputs\apk\debug\app-debug.apk

# Start app on device
adb shell am start -n com.example/com.example.MainActivity
```

**App is now installed!** ✅

---

## 3. Login to Dashboard (10 seconds)

1. Open browser: `http://localhost:5000`
2. Login page appears
3. Enter credentials:
   - **Email**: `test21@gmail.com`
   - **Password**: `test21@gmail.com`
4. Click "Sign In"

**Dashboard opens!** ✅

---

## 4. Setup Mobile App (1 minute)

1. App opens → Grant permissions (Location → SMS → Phone)
2. **Phone Number Screen** appears
3. Enter YOUR SIM number (e.g., `8446233170`)
4. Click "Verify & Continue"
5. ✅ Success! → "Connected" screen

**App is connected!** ✅

---

## 5. Test Live Monitoring (30 seconds)

### On Dashboard:
1. Enable "Live Monitoring" toggle (top right)

### On Device:
1. Turn ON Airplane Mode
2. Wait 2 seconds
3. Check dashboard

**Alert appears**: 📡 Network Offline ✅

### Test 2:
1. Turn OFF Airplane Mode
2. Wait 2 seconds

**Alert clears automatically** ✅

---

## 🎉 System is Working!

### What's Active:

**Backend**:
- ✅ Dashboard at `http://localhost:5000`
- ✅ Login authentication working
- ✅ Real-time monitoring (2s updates)

**Mobile**:
- ✅ Services running in background
- ✅ Monitoring SMS, SIM, Network
- ✅ Sending telemetry every 5 minutes

---

## Common Issues & Fixes

### Issue: "Cannot read SIM card"
**Fix**: Grant READ_PHONE_STATE permission, restart app

### Issue: Dashboard redirects to login
**Fix**: Login with `test21@gmail.com` / `test21@gmail.com`

### Issue: No alerts appearing
**Fix**: Enable "Live Monitoring" toggle on dashboard

### Issue: Phone verification fails
**Fix**: Enter the EXACT number on your SIM card

---

## Quick Commands

```bash
# Restart backend
cd backend && python app.py

# Reinstall app
adb install -r app\build\outputs\apk\debug\app-debug.apk

# Check services running
adb shell dumpsys activity services | Select-String -Pattern "PersistentMonitor"

# View mobile logs
adb logcat | Select-String -Pattern "PersistentMonitor|ALERT"

# Test network alert
# Turn ON Airplane Mode on device, watch dashboard
```

---

## Login Credentials

```
Email: test21@gmail.com
Password: test21@gmail.com
```

---

## URLs

- **Login**: http://localhost:5000/login
- **Dashboard**: http://localhost:5000/
- **Alerts Page**: http://localhost:5000/alerts
- **Logout**: http://localhost:5000/logout

---

## Features Working

✅ **Login authentication**  
✅ **Strict SIM verification**  
✅ **Real-time alerts** (2s updates)  
✅ **Alert auto-clearing**  
✅ **Background monitoring**  
✅ **Live monitoring toggle**  
✅ **Separate alerts page**  
✅ **Uninstall detection**  

---

## Next Steps

1. **Test SIM removal** (if safe):
   - Remove SIM from device
   - Wait 5 seconds
   - Alert appears: 📵 SIM Card Removed

2. **Test background operation**:
   - Close app completely
   - Remove from recents
   - Services keep running ✅

3. **View all alerts**:
   - Click "View Alerts" button
   - See detailed alert history

---

**System Status**: ✅ **FULLY OPERATIONAL**  
**Time to Setup**: ~2 minutes  
**Ready for Use**: YES 🚀

---

**Need Help?** Check:
- `ALL_FIXES_COMPLETE.md` - Full documentation
- `LIVE_MONITORING_TESTING.md` - Testing guide
- `ALERT_SYSTEM_COMPLETE.md` - Alert details
