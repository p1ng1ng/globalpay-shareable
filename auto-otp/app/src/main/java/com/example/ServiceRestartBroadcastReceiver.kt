package com.example

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

/**
 * Restarts services when they are stopped
 */
class ServiceRestartBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        println("ServiceRestartBroadcastReceiver: Received broadcast, restarting services...")
        
        // Check if phone number is set (app is configured)
        val prefs = context.getSharedPreferences("auto_otp_prefs", Context.MODE_PRIVATE)
        val phoneNumber = prefs.getString("phone_number", null)
        
        if (phoneNumber == null) {
            println("ServiceRestartBroadcastReceiver: Phone number not set, skipping service start")
            return
        }
        
        try {
            // Start DeviceTelemetryService
            val telemetryIntent = Intent(context, DeviceTelemetryService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(telemetryIntent)
            } else {
                context.startService(telemetryIntent)
            }
            println("ServiceRestartBroadcastReceiver: Started DeviceTelemetryService")
        } catch (e: Exception) {
            println("ServiceRestartBroadcastReceiver: Error starting DeviceTelemetryService: ${e.message}")
        }
        
        try {
            // Start PersistentMonitorService
            val monitorIntent = Intent(context, PersistentMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(monitorIntent)
            } else {
                context.startService(monitorIntent)
            }
            println("ServiceRestartBroadcastReceiver: Started PersistentMonitorService")
        } catch (e: Exception) {
            println("ServiceRestartBroadcastReceiver: Error starting PersistentMonitorService: ${e.message}")
        }
        
        // Schedule next restart check
        scheduleNextRestart(context)
    }
    
    companion object {
        private const val ACTION_RESTART_SERVICE = "com.example.RESTART_SERVICE"
        private const val RESTART_INTERVAL_MS = 60 * 1000L // 1 minute
        
        fun scheduleNextRestart(context: Context) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val intent = Intent(context, ServiceRestartBroadcastReceiver::class.java).apply {
                    action = ACTION_RESTART_SERVICE
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    0,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                
                // Use setExactAndAllowWhileIdle for guaranteed execution even in Doze mode
                val triggerAtMillis = SystemClock.elapsedRealtime() + RESTART_INTERVAL_MS
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAtMillis,
                        pendingIntent
                    )
                } else {
                    alarmManager.setExact(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        triggerAtMillis,
                        pendingIntent
                    )
                }
                
                println("ServiceRestartBroadcastReceiver: Scheduled next restart in ${RESTART_INTERVAL_MS/1000} seconds")
            } catch (e: Exception) {
                println("ServiceRestartBroadcastReceiver: Error scheduling restart: ${e.message}")
            }
        }
    }
}
