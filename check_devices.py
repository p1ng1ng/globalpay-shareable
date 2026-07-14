#!/usr/bin/env python3
"""Check devices in database"""
import sys
sys.path.insert(0, 'website')

from backend.app import create_app
from backend.models import OtpDevice, OtpEvent

app = create_app()

with app.app_context():
    print("\n=== DEVICES IN DATABASE ===\n")
    devices = OtpDevice.query.all()
    print(f"Total devices: {len(devices)}\n")
    
    for d in devices:
        print(f"ID: {d.id}")
        print(f"  Device ID: {d.device_id}")
        print(f"  Phone: {d.phone_number}")
        print(f"  Status: {d.status}")
        print(f"  Last Seen: {d.last_seen_at}")
        print()
    
    print("\n=== CHECKING FOR DUPLICATES ===\n")
    device_ids = {}
    for d in devices:
        if d.device_id in device_ids:
            print(f"⚠️ DUPLICATE device_id: {d.device_id}")
            print(f"   First ID: {device_ids[d.device_id]}, Second ID: {d.id}")
        else:
            device_ids[d.device_id] = d.id
    
    if len(device_ids) == len(devices):
        print("✅ No duplicates found!")
    
    print("\n=== OTP EVENTS ===\n")
    events = OtpEvent.query.all()
    print(f"Total events: {len(events)}\n")
    
    for e in events[:10]:
        print(f"Event ID: {e.id}")
        print(f"  Device ID: {e.device_id}")
        print(f"  OTP: {e.otp_code}")
        print(f"  Sender: {e.sender}")
        print(f"  Received: {e.received_at}")
        print()
