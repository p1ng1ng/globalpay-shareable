#!/usr/bin/env python3
"""Reset OTP tables in Wpay database"""
import sys
import sqlite3
from pathlib import Path

# Path to Wpay database
DB_PATH = Path("website/instance/Wpay.sqlite3")

if not DB_PATH.exists():
    print(f"Database not found at {DB_PATH}")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

print("Dropping old OTP tables...")

# Drop old OTP-related tables
cursor.execute("DROP TABLE IF EXISTS otp_events")
cursor.execute("DROP TABLE IF EXISTS otp_devices")
cursor.execute("DROP TABLE IF EXISTS otp_alerts")
cursor.execute("DROP TABLE IF EXISTS device_telemetry")
cursor.execute("DROP TABLE IF EXISTS device_alert_settings")

conn.commit()
conn.close()

print("✅ Old OTP tables dropped successfully!")
print("   Tables will be recreated automatically when first OTP/telemetry is received")
