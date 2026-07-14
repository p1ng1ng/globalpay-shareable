#!/usr/bin/env python3
"""Initialize auto-otp database"""
import sys
sys.path.insert(0, 'auto-otp/backend')

from app import init_db

init_db()
print("✅ Auto-OTP database initialized successfully!")
