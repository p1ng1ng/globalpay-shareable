@echo off
echo ========================================
echo Auto OTP - APK Build Script
echo ========================================
echo.

REM Check if Android Studio is installed
echo [1/4] Checking for Android Studio...
if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
    echo ✓ Android Studio found
    set JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr
) else if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    echo ✓ Android SDK found
) else (
    echo ✗ Android Studio not found in default location
    echo.
    echo Please install Android Studio from:
    echo https://developer.android.com/studio
    echo.
    pause
    exit /b 1
)

echo.
echo [2/4] Checking Gradle...
where gradle >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✓ Gradle found
    goto :build
) else (
    echo ✗ Gradle wrapper not found
    echo.
    echo ========================================
    echo IMPORTANT: Open this project in Android Studio to build
    echo ========================================
    echo.
    echo Steps:
    echo 1. Open Android Studio
    echo 2. File -^> Open -^> Select this folder
    echo 3. Wait for Gradle sync
    echo 4. Build -^> Build Bundle(s) / APK(s) -^> Build APK(s)
    echo.
    echo APK will be at: app\build\outputs\apk\debug\app-debug.apk
    echo.
    pause
    exit /b 1
)

:build
echo.
echo [3/4] Cleaning previous builds...
call gradlew clean

echo.
echo [4/4] Building APK...
call gradlew assembleDebug

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================
    echo ✓ BUILD SUCCESSFUL!
    echo ========================================
    echo.
    echo APK Location:
    echo %CD%\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo Install instructions:
    echo 1. Copy APK to your Android device
    echo 2. Enable "Install from Unknown Sources"
    echo 3. Open APK and install
    echo.
    start "" "%CD%\app\build\outputs\apk\debug\"
) else (
    echo ========================================
    echo ✗ BUILD FAILED
    echo ========================================
    echo.
    echo Please open project in Android Studio and:
    echo 1. Let it sync Gradle
    echo 2. Install any missing SDK components
    echo 3. Try Build -^> Rebuild Project
    echo.
)

pause
