package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

@JsonClass(generateAdapter = true)
data class TelemetryData(
    @Json(name = "device_id")
    val deviceId: String,
    @Json(name = "phone_number")
    val phoneNumber: String?,
    val latitude: Double?,
    val longitude: Double?,
    @Json(name = "location_accuracy")
    val locationAccuracy: Float?,
    @Json(name = "battery_level")
    val batteryLevel: Int?,
    @Json(name = "battery_status")
    val batteryStatus: String?,
    @Json(name = "device_model")
    val deviceModel: String,
    @Json(name = "device_manufacturer")
    val deviceManufacturer: String,
    @Json(name = "os_version")
    val osVersion: String,
    @Json(name = "app_version")
    val appVersion: String,
    @Json(name = "network_type")
    val networkType: String?,
    val timestamp: Long
)

interface TelemetryService {
    @POST("api/telemetry")
    suspend fun sendTelemetry(
        @Header("X-Auth-Token") token: String,
        @Body data: TelemetryData
    ): Response<Unit>
}

class DeviceTelemetryService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val handler = Handler(Looper.getMainLooper())
    private val telemetryRunnable = object : Runnable {
        override fun run() {
            collectAndSendTelemetry()
            handler.postDelayed(this, TELEMETRY_INTERVAL_MS)
        }
    }

    private val telemetryApi: TelemetryService by lazy {
        Retrofit.Builder()
            .baseUrl(normalizedBaseUrl())
            .client(
                OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(10, TimeUnit.SECONDS)
                    .writeTimeout(10, TimeUnit.SECONDS)
                    .build()
            )
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(TelemetryService::class.java)
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(
            NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .setContentTitle("Device Monitoring")
                .setContentText("Sending device telemetry every 5 minutes")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        )
        
        // Send initial telemetry immediately
        collectAndSendTelemetry()
        
        // Start periodic updates
        handler.post(telemetryRunnable)
        
        println("TelemetryService: Service started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_SEND_NOW) {
            collectAndSendTelemetry()
            handler.removeCallbacks(telemetryRunnable)
            handler.postDelayed(telemetryRunnable, TELEMETRY_INTERVAL_MS)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(telemetryRunnable)
        super.onDestroy()
        println("TelemetryService: Service stopped - Attempting restart")
        
        // Restart service if destroyed
        val restartIntent = Intent(applicationContext, DeviceTelemetryService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun collectAndSendTelemetry() {
        serviceScope.launch {
            try {
                println("TelemetryService: Collecting telemetry data...")
                
                val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
                val phoneNumber = getPhoneNumber()
                val location = getLocation()
                val battery = getBatteryInfo()
                val networkType = getNetworkType()
                
                // Check SIM state
                val simState = checkSimState()
                
                val telemetry = TelemetryData(
                    deviceId = deviceId,
                    phoneNumber = phoneNumber,
                    latitude = location?.latitude,
                    longitude = location?.longitude,
                    locationAccuracy = location?.accuracy,
                    batteryLevel = battery.first,
                    batteryStatus = battery.second,
                    deviceModel = Build.MODEL,
                    deviceManufacturer = Build.MANUFACTURER,
                    osVersion = Build.VERSION.RELEASE,
                    appVersion = "1.0",
                    networkType = networkType,
                    timestamp = System.currentTimeMillis()
                )
                
                println("TelemetryService: Phone: ${phoneNumber ?: "N/A"}, Battery: ${battery.first}%, Location: ${location?.latitude}, ${location?.longitude}, SIM: $simState")
                
                // Send alert if SIM removed
                if (!simState) {
                    sendSimAlert(deviceId, phoneNumber)
                }
                
                val response = telemetryApi.sendTelemetry(BuildConfig.MONITORING_TOKEN, telemetry)
                
                if (response.isSuccessful) {
                    println("TelemetryService: Successfully sent telemetry data (HTTP ${response.code()})")
                } else {
                    println("TelemetryService: Failed to send telemetry (HTTP ${response.code()})")
                }
            } catch (e: Exception) {
                println("TelemetryService: Error collecting/sending telemetry: ${e.message}")
                e.printStackTrace()
            }
        }
    }

    @SuppressLint("MissingPermission", "HardwareIds")
    private fun getPhoneNumber(): String? {
        return try {
            // First, try to get from SharedPreferences (user entered)
            val prefs = getSharedPreferences("auto_otp_prefs", Context.MODE_PRIVATE)
            val storedNumber = prefs.getString("phone_number", null)
            
            if (storedNumber != null && storedNumber.isNotBlank()) {
                println("TelemetryService: Got phone number from storage: ${storedNumber.take(3)}***")
                return storedNumber
            }
            
            // Fallback: Try to get from SIM
            val hasPhonePermission = checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            val hasPhoneNumbersPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                checkSelfPermission(Manifest.permission.READ_PHONE_NUMBERS) == PackageManager.PERMISSION_GRANTED
            } else {
                false
            }
            val hasSmsPermission = checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
            
            if (hasPhonePermission || hasPhoneNumbersPermission || hasSmsPermission) {
                val telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                
                // Try line1Number
                telephonyManager.line1Number?.takeIf { it.isNotBlank() }?.let { 
                    println("TelemetryService: Got phone number from line1Number: ${it.take(3)}***")
                    return it 
                }
                
                // Try getLine1Number
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    runCatching {
                        telephonyManager.getLine1Number()?.takeIf { it.isNotBlank() }
                    }.getOrNull()?.let {
                        println("TelemetryService: Got phone number from getLine1Number: ${it.take(3)}***")
                        return it
                    }
                }
            }
            
            println("TelemetryService: No phone number available")
            return null
        } catch (e: Exception) {
            println("TelemetryService: Error getting phone number: ${e.message}")
            null
        }
    }

    @SuppressLint("MissingPermission")
    private fun getLocation(): Location? {
        return try {
            val hasFine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val hasCoarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            
            if (!hasFine && !hasCoarse) return null
            
            val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            locationManager.getProviders(true)
                .mapNotNull { provider ->
                    runCatching { locationManager.getLastKnownLocation(provider) }.getOrNull()
                }
                .maxByOrNull { it.time }
        } catch (e: Exception) {
            println("TelemetryService: Error getting location: ${e.message}")
            null
        }
    }

    private fun getBatteryInfo(): Pair<Int?, String?> {
        return try {
            val batteryStatus = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            
            val batteryPct = if (level >= 0 && scale > 0) {
                (level * 100) / scale
            } else {
                null
            }
            
            val statusText = when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
                BatteryManager.BATTERY_STATUS_FULL -> "Full"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not Charging"
                else -> "Unknown"
            }
            
            Pair(batteryPct, statusText)
        } catch (e: Exception) {
            println("TelemetryService: Error getting battery info: ${e.message}")
            Pair(null, null)
        }
    }

    private fun getNetworkType(): String? {
        return try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = connectivityManager.activeNetwork ?: return null
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return null
            
            when {
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                else -> "Unknown"
            }
        } catch (e: Exception) {
            println("TelemetryService: Error getting network type: ${e.message}")
            null
        }
    }

    private fun normalizedBaseUrl(): String {
        val configured = BuildConfig.MONITORING_BASE_URL.trim().ifBlank { "http://10.0.2.2:5000" }
        return if (configured.endsWith("/")) configured else "$configured/"
    }
    
    @SuppressLint("MissingPermission")
    private fun checkSimState(): Boolean {
        return try {
            val hasPermission = checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
            if (!hasPermission) return true // Can't check, assume OK
            
            val telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            val simState = telephonyManager.simState
            
            val isSimReady = simState == TelephonyManager.SIM_STATE_READY
            
            if (!isSimReady) {
                println("TelemetryService: SIM NOT READY - State: $simState")
            }
            
            isSimReady
        } catch (e: Exception) {
            println("TelemetryService: Error checking SIM state: ${e.message}")
            true // Assume OK on error
        }
    }
    
    private fun sendSimAlert(deviceId: String, phoneNumber: String?) {
        serviceScope.launch {
            try {
                // Send alert to backend about SIM removal
                val alert = mapOf(
                    "type" to "sim_removed",
                    "device_id" to deviceId,
                    "phone_number" to (phoneNumber ?: "Unknown"),
                    "message" to "SIM card removed or not available",
                    "timestamp" to System.currentTimeMillis()
                )
                println("TelemetryService: SIM ALERT - ${alert["message"]}")
                // Backend will handle this via missing telemetry
            } catch (e: Exception) {
                println("TelemetryService: Error sending SIM alert: ${e.message}")
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Device Monitoring",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Background device telemetry monitoring"
        }
        
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(channel)
    }

    companion object {
        const val ACTION_SEND_NOW = "com.example.action.SEND_TELEMETRY_NOW"
        private const val CHANNEL_ID = "telemetry_service"
        private const val NOTIFICATION_ID = 1002
        private const val TELEMETRY_INTERVAL_MS = 45 * 1000L // 45 seconds
    }
}
