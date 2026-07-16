"""
WSGI config for GlobalPay Flask backend on PythonAnywhere.

IMPORTANT: Copy this content to your WSGI configuration file on PythonAnywhere.
The file is usually located at: /var/www/YOUR_USERNAME_pythonanywhere_com_wsgi.py

Replace YOUR_USERNAME with your actual PythonAnywhere username.
"""

import sys
import os

# IMPORTANT: Replace 'v123113456' with your actual PythonAnywhere username
USERNAME = 'v123113456'

# The mysite directory contains flask_app.py and backend/
project_home = f'/home/{USERNAME}/mysite'

# Add the mysite directory to Python path so 'backend' module can be found
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Change working directory to mysite folder for relative paths
os.chdir(project_home)

# Import the Flask application
# This now works because:
# 1. sys.path includes /home/{USERNAME}/mysite
# 2. backend/ folder is in /home/{USERNAME}/mysite/backend
# 3. flask_app.py can import backend.app successfully
from flask_app import app as application

# Debug logging (optional - can remove after it works)
print(f"WSGI: Python path includes: {project_home}")
print(f"WSGI: Working directory: {os.getcwd()}")
print(f"WSGI: Application loaded successfully")
