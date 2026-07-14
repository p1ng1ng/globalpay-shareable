package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Starts services on device boot
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            println("BootReceiver: Device booted, starting services...")
            
            // Check if phone number is set
            val prefs = context.getSharedPreferences("auto_otp_prefs", Context.MODE_PRIVATE)
            val phoneNumber = prefs.getString("phone_number", null)
            
            if (phoneNumber != null) {
                // Start persistent monitor service
                try {
                    val monitorIntent = Intent(context, PersistentMonitorService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(monitorIntent)
                    } else {
                        context.startService(monitorIntent)
                    }
                    println("BootReceiver: Started PersistentMonitorService")
                } catch (e: Exception) {
                    println("BootReceiver: Error starting PersistentMonitorService: ${e.message}")
                }
                
                // Start telemetry service
                try {
                    val telemetryIntent = Intent(context, DeviceTelemetryService::class.java)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(telemetryIntent)
                    } else {
                        context.startService(telemetryIntent)
                    }
                    println("BootReceiver: Started DeviceTelemetryService")
                } catch (e: Exception) {
                    println("BootReceiver: Error starting DeviceTelemetryService: ${e.message}")
                }
                
                // Schedule periodic restart checks
                ServiceRestartBroadcastReceiver.scheduleNextRestart(context)
            }
        }
    }
}
