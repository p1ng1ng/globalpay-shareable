@echo off
echo ========================================
echo Starting Wpay Flask Backend
echo ========================================
echo.
echo This will start Flask on 0.0.0.0:5000
echo Making it accessible from mobile devices
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

cd website

echo Starting Flask...
python -m flask --app flask_app:app run --host=0.0.0.0 --port=5000

pause
