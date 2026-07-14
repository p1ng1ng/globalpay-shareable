# PowerShell Script to Get Android Crash Logs
# Usage: Right-click and "Run with PowerShell"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "   Android Crash Log Viewer" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if ADB is available
$adbPath = (Get-Command adb -ErrorAction SilentlyContinue).Source

if (-not $adbPath) {
    Write-Host "ERROR: ADB not found!" -ForegroundColor Red
    Write-Host "Please install Android SDK Platform Tools:" -ForegroundColor Yellow
    Write-Host "https://developer.android.com/tools/releases/platform-tools" -ForegroundColor Yellow
    Write-Host ""
    Pause
    exit
}

Write-Host "ADB found at: $adbPath" -ForegroundColor Green
Write-Host ""

# Check if device is connected
Write-Host "Checking for connected devices..." -ForegroundColor Cyan
$devices = adb devices
Write-Host $devices
Write-Host ""

if ($devices -match "device$") {
    Write-Host "Device connected successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: No device found!" -ForegroundColor Red
    Write-Host "Make sure USB debugging is enabled and device is connected." -ForegroundColor Yellow
    Write-Host ""
    Pause
    exit
}

Write-Host ""
Write-Host "Select an option:" -ForegroundColor Cyan
Write-Host "1. Clear logs and wait for new crash" -ForegroundColor Yellow
Write-Host "2. View last crash from existing logs" -ForegroundColor Yellow
Write-Host "3. View live logcat (press Ctrl+C to stop)" -ForegroundColor Yellow
Write-Host ""

$choice = Read-Host "Enter your choice (1, 2, or 3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Clearing old logs..." -ForegroundColor Cyan
        adb logcat -c
        Write-Host "Logs cleared!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Now open the app and let it crash..." -ForegroundColor Yellow
        Write-Host "Press any key after the crash occurs..." -ForegroundColor Yellow
        Pause
        Write-Host ""
        Write-Host "Fetching crash logs..." -ForegroundColor Cyan
        $outputFile = "crash_log_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
        adb logcat -d | Out-File -FilePath $outputFile
        Write-Host ""
        Write-Host "Full log saved to: $outputFile" -ForegroundColor Green
        Write-Host ""
        Write-Host "Crash details:" -ForegroundColor Cyan
        Get-Content $outputFile | Select-String "FATAL|AndroidRuntime|Exception|Error" | Select-Object -First 100
    }
    "2" {
        Write-Host ""
        Write-Host "Fetching last crash from logs..." -ForegroundColor Cyan
        $outputFile = "last_crash_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
        adb logcat -d | Out-File -FilePath $outputFile
        Write-Host "Full log saved to: $outputFile" -ForegroundColor Green
        Write-Host ""
        Write-Host "Recent crash/error details:" -ForegroundColor Cyan
        Get-Content $outputFile | Select-String "FATAL|AndroidRuntime|Exception" | Select-Object -Last 100
    }
    "3" {
        Write-Host ""
        Write-Host "Starting live logcat (Press Ctrl+C to stop)..." -ForegroundColor Cyan
        Write-Host ""
        adb logcat | Select-String "FATAL|AndroidRuntime|Exception|Error|com.example"
    }
    default {
        Write-Host "Invalid choice!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Pause
