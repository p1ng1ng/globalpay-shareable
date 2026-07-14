package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Receiver that detects when app is being uninstalled
 * Sends alert to backend before uninstall completes
 */
class UninstallReceiver : BroadcastReceiver() {
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_DELETE,
            Intent.ACTION_PACKAGE_REMOVED,
            Intent.ACTION_PACKAGE_FULLY_REMOVED,
            "android.intent.action.UNINSTALL_PACKAGE" -> {
                val packageName = intent.data?.schemeSpecificPart
                if (packageName == context.packageName || packageName == null) {
                    println("UninstallReceiver: 🚨 APP BEING UNINSTALLED!")
                    sendUninstallAlert(context)
                }
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                println("UninstallReceiver: App updated/reinstalled")
            }
        }
    }
    
    private fun sendUninstallAlert(context: Context) {
        scope.launch {
            try {
                val prefs = context.getSharedPreferences("auto_otp_prefs", Context.MODE_PRIVATE)
                val phoneNumber = prefs.getString("phone_number", null)
                val deviceId = Settings.Secure.getString(
                    context.contentResolver,
                    Settings.Secure.ANDROID_ID
                )
                
                println("UninstallReceiver: Sending uninstall alert to backend...")
                
                OtpReporter.reportAlert(
                    context,
                    "app_uninstalling",
                    "App is being uninstalled by user",
                    phoneNumber ?: "Unknown",
                    deviceId
                )
                
                println("UninstallReceiver: Uninstall alert sent successfully")
            } catch (e: Exception) {
                println("UninstallReceiver: Error sending uninstall alert: ${e.message}")
            }
        }
    }
}
