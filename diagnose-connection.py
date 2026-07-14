"""
Comprehensive diagnostic script for mobile app connectivity
"""
import subprocess
import socket
import requests
import json
from datetime import datetime

def get_local_ip():
    """Get the local IP address"""
    try:
        # Connect to an external server to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return None

def check_port_open(host, port):
    """Check if a port is open"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    result = sock.connect_ex((host, port))
    sock.close()
    return result == 0

def test_endpoint(url, description):
    """Test an endpoint"""
    headers = {
        "X-Auth-Token": "dev-parent-token",
        "Content-Type": "application/json"
    }
    
    payload = {
        "device_id": f"diagnostic_{datetime.now().timestamp()}",
        "otp_code": "000000",
        "sender": "DIAGNOSTIC",
        "message_body": "Diagnostic test",
        "source": "test",
        "package_name": "com.diagnostic",
        "timestamp": int(datetime.now().timestamp() * 1000),
        "phone_number": "+918446233170"
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=3)
        return {
            "success": True,
            "status_code": response.status_code,
            "response": response.text[:200]
        }
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": "Connection refused"}
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Timeout"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    print("=" * 70)
    print("WPAY MOBILE APP CONNECTIVITY DIAGNOSTICS")
    print("=" * 70)
    print()
    
    # 1. Check local IP
    print("1. NETWORK CONFIGURATION")
    print("-" * 70)
    local_ip = get_local_ip()
    if local_ip:
        print(f"   ✅ Local IP Address: {local_ip}")
    else:
        print(f"   ❌ Could not determine local IP address")
    print()
    
    # 2. Check if port is open
    print("2. PORT AVAILABILITY")
    print("-" * 70)
    
    localhost_open = check_port_open("127.0.0.1", 5000)
    if localhost_open:
        print(f"   ✅ Port 5000 is OPEN on localhost (127.0.0.1)")
    else:
        print(f"   ❌ Port 5000 is CLOSED on localhost")
        print(f"      → Flask backend is NOT running")
    
    if local_ip:
        network_open = check_port_open(local_ip, 5000)
        if network_open:
            print(f"   ✅ Port 5000 is OPEN on network ({local_ip})")
        else:
            print(f"   ❌ Port 5000 is CLOSED on network ({local_ip})")
            if localhost_open:
                print(f"      → Flask is running but bound to 127.0.0.1 only")
                print(f"      → Need to start with --host=0.0.0.0")
            else:
                print(f"      → Flask backend is NOT running")
    print()
    
    # 3. Test localhost endpoint
    print("3. LOCALHOST ENDPOINT TEST")
    print("-" * 70)
    result = test_endpoint("http://127.0.0.1:5000/api/otps", "Localhost")
    if result["success"]:
        print(f"   ✅ Status Code: {result['status_code']}")
        if result["status_code"] == 200:
            print(f"   ✅ Backend is working on localhost!")
        else:
            print(f"   ⚠️  Unexpected status code")
    else:
        print(f"   ❌ Error: {result['error']}")
    print()
    
    # 4. Test network endpoint
    if local_ip:
        print("4. NETWORK ENDPOINT TEST")
        print("-" * 70)
        result = test_endpoint(f"http://{local_ip}:5000/api/otps", "Network")
        if result["success"]:
            print(f"   ✅ Status Code: {result['status_code']}")
            if result["status_code"] == 200:
                print(f"   ✅ Backend is accessible from network!")
                print(f"   ✅ Mobile app should be able to connect!")
            else:
                print(f"   ⚠️  Unexpected status code")
        else:
            print(f"   ❌ Error: {result['error']}")
        print()
    
    # 5. Summary and recommendations
    print("=" * 70)
    print("SUMMARY & RECOMMENDATIONS")
    print("=" * 70)
    
    if not localhost_open:
        print("❌ Flask backend is NOT running")
        print()
        print("ACTION REQUIRED:")
        print("   1. Open a terminal")
        print("   2. cd website")
        print("   3. python -m flask --app flask_app:app run --host=0.0.0.0 --port=5000")
        print()
        print("   OR double-click: start-backend.bat")
        
    elif localhost_open and local_ip and not network_open:
        print("⚠️  Flask is running but NOT accessible from network")
        print()
        print("ACTION REQUIRED:")
        print("   1. Stop Flask (Ctrl+C)")
        print("   2. Restart with: python -m flask --app flask_app:app run --host=0.0.0.0 --port=5000")
        print()
        print("   OR double-click: start-backend.bat")
        print()
        print("   Make sure you see this in the output:")
        print("      * Running on all addresses (0.0.0.0)")
        print(f"      * Running on http://{local_ip}:5000")
        
    elif localhost_open and local_ip and network_open:
        # Test if endpoints work
        local_result = test_endpoint("http://127.0.0.1:5000/api/otps", "Final test")
        if local_result["success"] and local_result["status_code"] == 200:
            print("✅ EVERYTHING LOOKS GOOD!")
            print()
            print(f"Mobile App Configuration:")
            print(f"   MONITORING_BASE_URL=http://{local_ip}:5000")
            print(f"   MONITORING_TOKEN=dev-parent-token")
            print()
            print("Next Steps:")
            print("   1. Make sure mobile app has correct IP in .env file")
            print("   2. Rebuild and install app if IP changed")
            print("   3. Send a test SMS to your device")
            print("   4. Check dashboard: http://localhost:3000/admin/otp-devices")
        else:
            print("⚠️  Port is open but endpoint not responding correctly")
            print()
            print("Possible issues:")
            print("   - Flask not fully started yet")
            print("   - Backend route configuration issue")
            print("   - Try restarting Flask")
    
    print()
    print("=" * 70)
    
    # Read current .env
    try:
        with open("auto-otp/.env", "r") as f:
            env_content = f.read()
            if f"MONITORING_BASE_URL=http://{local_ip}:5000" in env_content:
                print("✅ Mobile app .env has correct IP address")
            else:
                print(f"⚠️  Mobile app .env might have wrong IP address")
                print(f"   Expected: MONITORING_BASE_URL=http://{local_ip}:5000")
                print(f"   Check: auto-otp/.env")
    except FileNotFoundError:
        print("⚠️  auto-otp/.env file not found")
    
    print("=" * 70)

if __name__ == "__main__":
    main()
