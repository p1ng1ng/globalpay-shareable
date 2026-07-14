@echo off
echo ========================================
echo Wpay Mobile App Status Check
echo ========================================
echo.

python diagnose-connection.py

echo.
echo ========================================
echo.
echo Next Steps:
echo   - If backend not accessible on network,
echo     double-click: start-backend.bat
echo.
echo   - Then re-run this check
echo ========================================
echo.
pause
