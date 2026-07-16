# WSGI Configuration for PythonAnywhere
# Copy this to: /var/www/v123113456_pythonanywhere_com_wsgi.py

import sys
import os

# Add your project directory to the sys.path
project_home = '/home/v123113456/mysite'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set working directory
os.chdir(project_home)

# Import Flask app
from flask_app import app as application
