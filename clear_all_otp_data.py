import sqlite3

conn = sqlite3.connect('website/instance/Wpay.sqlite3')
cursor = conn.cursor()

# Clear all OTP data
cursor.execute('DELETE FROM device_telemetry')
cursor.execute('DELETE FROM otp_events')
conn.commit()

print('✅ All OTP data cleared - fresh start ready!')
print('   Database is empty and waiting for real device data')

conn.close()
