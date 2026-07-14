import sqlite3

conn = sqlite3.connect('website/instance/Wpay.sqlite3')
cur = conn.cursor()

# Check if tables exist
tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables in database:", [t[0] for t in tables])

# Check device_telemetry
if any('device_telemetry' in t for t in tables):
    count = cur.execute('SELECT COUNT(*) FROM device_telemetry').fetchone()[0]
    print(f'\nDevice Telemetry Entries: {count}')
    if count > 0:
        devices = cur.execute('SELECT device_id, phone_number, timestamp FROM device_telemetry ORDER BY timestamp DESC LIMIT 5').fetchall()
        print('Latest devices:', devices)
else:
    print('\nDevice Telemetry Table: Not created yet')

# Check otp_events
if any('otp_events' in t for t in tables):
    count = cur.execute('SELECT COUNT(*) FROM otp_events').fetchone()[0]
    print(f'\nOTP Events: {count}')
    if count > 0:
        events = cur.execute('SELECT device_id, otp_code, sender, timestamp FROM otp_events ORDER BY timestamp DESC LIMIT 5').fetchall()
        print('Latest OTPs:', events)
else:
    print('\nOTP Events Table: Not created yet')

conn.close()
print('\n✅ Database check complete')
