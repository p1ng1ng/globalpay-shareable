package com.example

import android.content.Context
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CodeVerificationScreen(
    onCodeVerified: () -> Unit
) {
    val context = LocalContext.current
    var activationCode by remember { mutableStateOf("") }
    var isVerifying by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Device Activation") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = "Lock",
                modifier = Modifier.size(80.dp),
                tint = MaterialTheme.colorScheme.primary
            )

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Enter Activation Code",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Please enter the 8-character activation code provided by your administrator",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(32.dp))

            OutlinedTextField(
                value = activationCode,
                onValueChange = { 
                    activationCode = it.uppercase().filter { char ->
                        char.isLetterOrDigit()
                    }.take(8)
                    errorMessage = null
                },
                label = { Text("Activation Code") },
                placeholder = { Text("ABCD1234") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                modifier = Modifier.fillMaxWidth(),
                enabled = !isVerifying,
                isError = errorMessage != null
            )

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = errorMessage!!,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (activationCode.length == 8) {
                        scope.launch {
                            isVerifying = true
                            errorMessage = null
                            
                            val result = verifyActivationCode(context, activationCode)
                            
                            if (result.success) {
                                onCodeVerified()
                            } else {
                                errorMessage = result.error
                            }
                            
                            isVerifying = false
                        }
                    } else {
                        errorMessage = "Please enter an 8-character code"
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                enabled = !isVerifying && activationCode.length == 8
            ) {
                if (isVerifying) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text("Verify Code", fontSize = 16.sp)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = "ℹ️ About Activation",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "• Each activation code can only be used by one device\n" +
                               "• Contact your administrator to get an activation code\n" +
                               "• If you reinstall the app, you'll need to verify again",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        lineHeight = 18.sp
                    )
                }
            }
        }
    }
}

data class VerificationResult(
    val success: Boolean,
    val error: String? = null
)

suspend fun verifyActivationCode(context: Context, code: String): VerificationResult {
    return withContext(Dispatchers.IO) {
        try {
            val deviceId = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: "unknown"

            val baseUrl = normalizeBaseUrl(BuildConfig.MONITORING_BASE_URL)
            val url = "${baseUrl}api/activation-codes/verify"

            val json = JSONObject().apply {
                put("code", code)
                put("deviceId", deviceId)
            }

            val client = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .build()

            val requestBody = json.toString().toRequestBody(
                "application/json; charset=utf-8".toMediaTypeOrNull()
            )

            val request = Request.Builder()
                .url(url)
                .post(requestBody)
                .build()

            println("CodeVerification: Sending request to $url")
            println("CodeVerification: Device ID: $deviceId, Code: $code")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            println("CodeVerification: Response code: ${response.code}")
            println("CodeVerification: Response body: $responseBody")

            if (response.isSuccessful) {
                VerificationResult(success = true)
            } else {
                val errorJson = JSONObject(responseBody)
                val errorMsg = errorJson.optString("error", "Verification failed")
                VerificationResult(success = false, error = errorMsg)
            }
        } catch (e: Exception) {
            println("CodeVerification: Error - ${e.message}")
            e.printStackTrace()
            VerificationResult(
                success = false,
                error = "Network error: ${e.message}"
            )
        }
    }
}

private fun normalizeBaseUrl(configured: String): String {
    val trimmed = configured.trim().ifBlank { "http://10.0.2.2:5000" }
    return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
}
