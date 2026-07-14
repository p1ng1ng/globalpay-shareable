package com.example

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Activity that shows a warning before allowing app uninstall
 * Launched when user tries to uninstall the app
 */
class UninstallWarningActivity : Activity() {
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        println("UninstallWarningActivity: Showing uninstall warning...")
        
        showUninstallWarning()
    }
    
    private fun showUninstallWarning() {
        AlertDialog.Builder(this)
            .setTitle("⚠️ Warning: Uninstalling App")
            .setMessage(
                "Uninstalling this app will disconnect you from the monitoring service.\n\n" +
                "• You will stop receiving OTP forwarding\n" +
                "• Device monitoring will be disabled\n" +
                "• All local data will be lost\n\n" +
                "Are you sure you want to proceed with uninstall?"
            )
            .setIcon(android.R.drawable.ic_dialog_alert)
            .setPositiveButton("Yes, Uninstall") { dialog, _ ->
                println("UninstallWarningActivity: User confirmed uninstall")
                
                // Send alert to backend
                sendUninstallAlert()
                
                // Proceed to system uninstall
                dialog.dismiss()
                proceedWithUninstall()
            }
            .setNegativeButton("Cancel") { dialog, _ ->
                println("UninstallWarningActivity: User cancelled uninstall")
                dialog.dismiss()
                finish()
            }
            .setCancelable(false)
            .setOnDismissListener {
                if (!isFinishing) {
                    finish()
                }
            }
            .show()
    }
    
    private fun sendUninstallAlert() {
        scope.launch {
            try {
                val prefs = getSharedPreferences("auto_otp_prefs", MODE_PRIVATE)
                val phoneNumber = prefs.getString("phone_number", null)
                val deviceId = Settings.Secure.getString(
                    contentResolver,
                    Settings.Secure.ANDROID_ID
                )
                
                println("UninstallWarningActivity: Sending uninstall alert...")
                
                OtpReporter.reportAlert(
                    applicationContext,
                    "app_uninstalling",
                    "User confirmed app uninstall",
                    phoneNumber ?: "Unknown",
                    deviceId
                )
                
                println("UninstallWarningActivity: Alert sent successfully")
            } catch (e: Exception) {
                println("UninstallWarningActivity: Error sending alert: ${e.message}")
            }
        }
    }
    
    private fun proceedWithUninstall() {
        try {
            // Open system uninstall screen
            val intent = Intent(Intent.ACTION_DELETE)
            intent.data = Uri.parse("package:$packageName")
            startActivity(intent)
            finish()
        } catch (e: Exception) {
            println("UninstallWarningActivity: Error opening uninstall screen: ${e.message}")
            finish()
        }
    }
}
