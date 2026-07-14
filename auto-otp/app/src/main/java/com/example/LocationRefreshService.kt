package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import java.util.Locale

class LocationRefreshService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val refreshRunnable = object : Runnable {
        override fun run() {
            refreshLocation()
            handler.postDelayed(this, REFRESH_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(
            NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Auto OTP location active")
                .setContentText("Refreshing location every 5 minutes")
                .setOngoing(true)
                .build()
        )
        handler.post(refreshRunnable)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        handler.removeCallbacks(refreshRunnable)
        handler.post(refreshRunnable)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(refreshRunnable)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission")
    private fun refreshLocation() {
        val hasFine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val hasCoarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) {
            saveLocation("Location permission needed")
            return
        }

        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val lastKnown = locationManager.getProviders(true)
            .mapNotNull { provider ->
                runCatching { locationManager.getLastKnownLocation(provider) }.getOrNull()
            }
            .maxByOrNull { it.time }

        if (lastKnown != null) {
            saveLocation(formatLocation(lastKnown))
        }

        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .firstOrNull { provider ->
                runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false)
            }

        if (provider == null) {
            if (lastKnown == null) saveLocation("Turn on location services")
            return
        }

        runCatching {
            locationManager.requestSingleUpdate(
                provider,
                object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        saveLocation(formatLocation(location))
                    }
                },
                Looper.getMainLooper()
            )
        }.onFailure {
            if (lastKnown == null) saveLocation("Location unavailable")
        }
    }

    private fun saveLocation(locationText: String) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LOCATION_TEXT, locationText)
            .putLong(KEY_LOCATION_UPDATED_AT, System.currentTimeMillis())
            .apply()

        sendBroadcast(Intent(ACTION_LOCATION_UPDATED).putExtra(KEY_LOCATION_TEXT, locationText))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Location refresh",
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        const val ACTION_LOCATION_UPDATED = "com.example.LOCATION_UPDATED"
        const val PREFS_NAME = "device_status"
        const val KEY_LOCATION_TEXT = "location_text"
        const val KEY_LOCATION_UPDATED_AT = "location_updated_at"

        private const val CHANNEL_ID = "location_refresh"
        private const val NOTIFICATION_ID = 1001
        private const val REFRESH_INTERVAL_MS = 5 * 60 * 1000L

        private fun formatLocation(location: Location): String {
            return String.format(Locale.US, "%.5f, %.5f", location.latitude, location.longitude)
        }
    }
}
