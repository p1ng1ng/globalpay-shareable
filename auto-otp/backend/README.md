# 🔐 Auto OTP Backend Server

A beautiful Flask-based backend server with real-time dashboard for monitoring OTP messages from Android devices.

## ✨ Features

- **📊 Real-time Dashboard** - Beautiful, modern UI built entirely with Python (Flask + inline HTML/CSS/JS)
- **📱 Mobile App Integration** - Receives OTP data from Android devices
- **💾 SQLite Database** - Lightweight, file-based storage with automatic indexing
- **🔐 Token Authentication** - Secure API endpoints with token-based auth
- **📈 Live Statistics** - Total OTPs, 24-hour activity, device tracking, sender analytics
- **🔍 Search & Filter** - Search by sender, OTP code, message, or source type
- **⚡ Auto-refresh** - Dashboard updates every 10 seconds automatically
- **🌙 Dark Theme** - Modern dark UI with gradient accents

## 🚀 Quick Start

### 1. Installation

```bash
cd backend
pip install -r requirements.txt
```

### 2. Run the Server

```bash
python app.py
```

The server will start on `http://0.0.0.0:5000` by default.

### 3. Access the Dashboard

Open your browser and navigate to:
```
http://localhost:5000/
```

## 🔧 Configuration

Configure the server using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server host address |
| `PORT` | `5000` | Server port |
| `MONITORING_TOKEN` | `dev-parent-token` | Authentication token |
| `OTP_DB_PATH` | `./otp_events.sqlite3` | Database file path |
| `FLASK_DEBUG` | `0` | Enable debug mode (set to `1`) |

Example:
```bash
export MONITORING_TOKEN="my-secret-token"
export PORT=8080
python app.py
```

## 📡 API Endpoints

### Dashboard & Stats
- `GET /` - Main dashboard (HTML UI)
- `GET /health` - Health check endpoint
- `GET /api/stats` - Get statistics (JSON)

### OTP Management
- `POST /api/otps` - Receive OTP from mobile device (requires auth)
- `GET /api/otps?limit=100&sender=Bank` - List OTPs with filters (requires auth)
- `GET /api/devices` - List active devices (requires auth)

### Authentication

Protected endpoints require the `X-Auth-Token` header:
```bash
curl -X POST http://localhost:5000/api/otps \
  -H "X-Auth-Token: dev-parent-token" \
  -H "Content-Type: application/json" \
  -d '{
    "otp_code": "123456",
    "sender": "Bank",
    "message_body": "Your OTP is 123456",
    "timestamp": 1720000000000,
    "source": "sms_broadcast",
    "device_id": "android-device-id",
    "package_name": "com.example"
  }'
```

## 📱 Mobile App Integration

The Android app sends OTP data to the backend automatically. Configure in `.env`:

```env
MONITORING_BASE_URL=http://YOUR_SERVER_IP:5000
MONITORING_TOKEN=dev-parent-token
```

For local testing with Android emulator:
```env
MONITORING_BASE_URL=http://10.0.2.2:5000
```

For physical device on same network:
```env
MONITORING_BASE_URL=http://YOUR_COMPUTER_IP:5000
```

## 💾 Database Schema

The SQLite database stores OTP events with the following schema:

```sql
CREATE TABLE otp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    otp_code TEXT NOT NULL,
    sender TEXT NOT NULL,
    message_body TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    source TEXT NOT NULL,
    device_id TEXT NOT NULL,
    package_name TEXT NOT NULL,
    received_at TEXT NOT NULL,
    raw_payload TEXT NOT NULL,
    UNIQUE(device_id, timestamp, otp_code, source)
);
```

Indexes:
- `idx_timestamp` - For fast time-based queries
- `idx_device_id` - For device filtering
- `idx_sender` - For sender filtering

## 🎨 Dashboard Features

### Statistics Cards
- **Total OTPs Received** - All-time count
- **Last 24 Hours** - Recent activity indicator
- **Active Devices** - Number of unique devices
- **Unique Senders** - Number of unique OTP senders

### Top Senders
Shows the 5 most frequent OTP senders with message counts.

### OTP Message Table
- Real-time OTP code display
- Sender information
- Full message preview
- Source type (SMS/Notification)
- Device ID
- Timestamp
- Search and filter capabilities

### Search & Filter
- Text search across sender, OTP code, and message
- Filter by source type (SMS, Notification, All)
- Real-time filtering without page reload

## 🔒 Security Notes

- Change the default `MONITORING_TOKEN` in production
- Use HTTPS in production environments
- Consider adding rate limiting for API endpoints
- Firewall rules to restrict access to trusted IPs

## 🐛 Troubleshooting

### Server won't start
- Check if port 5000 is already in use
- Verify Python and Flask installation
- Check file permissions for database directory

### Mobile app can't connect
- Ensure server is running and accessible
- Check firewall settings
- Verify IP address and port configuration
- Test with `curl http://YOUR_SERVER_IP:5000/health`

### Database errors
- Check write permissions in backend directory
- Verify disk space availability
- Check database file isn't corrupted

## 📊 Sample API Response

### POST /api/otps
```json
{
  "ok": true,
  "received": 1,
  "inserted": 1
}
```

### GET /api/stats
```json
{
  "total_otps": 150,
  "last_24h": 25,
  "unique_devices": 3,
  "unique_senders": 12,
  "top_senders": [
    {"sender": "Bank", "count": 45},
    {"sender": "Amazon", "count": 32}
  ],
  "daily_activity": [
    {"day": "2026-07-10", "count": 25}
  ]
}
```

## 📝 License

This project is part of the Auto OTP application suite.

## 🤝 Support

For issues or questions, please check the main project README or create an issue in the repository.

---

**Built with ❤️ using Flask + SQLite + Pure Python UI**
