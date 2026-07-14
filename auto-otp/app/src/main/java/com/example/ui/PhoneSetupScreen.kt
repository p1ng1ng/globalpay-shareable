package com.example.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Warning
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
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody

@SuppressLint("MissingPermission")
fun getSimNumbers(context: Context): SimDetectionResult {
    val numbers = mutableListOf<String>()
    var hasActiveSim = false
    var hasReadableNumber = false
    
    try {
        // Check permissions first
        val hasReadPhoneState = ContextCompat.checkSelfPermission(
            context, 
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
        
        val hasReadPhoneNumbers = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_NUMBERS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
        
        if (!hasReadPhoneState && !hasReadPhoneNumbers) {
            println("PhoneSetup: Missing permissions for reading SIM numbers")
            return SimDetectionResult(emptyList(), hasActiveSim = false, canReadNumbers = false)
        }
        
        // Method 1: Try SubscriptionManager (most reliable on modern Android)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                val subscriptions = subscriptionManager?.activeSubscriptionInfoList
                hasActiveSim = !subscriptions.isNullOrEmpty()
                
                subscriptions?.forEach { info ->
                    val number = info.number
                    val cleanNumber = normalizeIndianMobileNumber(number)
                    if (cleanNumber != null) {
                        hasReadableNumber = true
                        numbers.add(cleanNumber)
                        println("PhoneSetup: Found SIM number from SubscriptionManager: $cleanNumber")
                    }
                }
            } catch (e: Exception) {
                println("PhoneSetup: SubscriptionManager error: ${e.message}")
            }
        }
        
        // Method 2: Try TelephonyManager (fallback)
        if (numbers.isEmpty()) {
            try {
                val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                val line1Number = telephonyManager.line1Number
                hasActiveSim = hasActiveSim || telephonyManager.simState == TelephonyManager.SIM_STATE_READY
                
                val cleanNumber = normalizeIndianMobileNumber(line1Number)
                if (cleanNumber != null) {
                    hasReadableNumber = true
                    if (!numbers.contains(cleanNumber)) {
                        numbers.add(cleanNumber)
                        println("PhoneSetup: Found SIM number from TelephonyManager: $cleanNumber")
                    }
                }
            } catch (e: Exception) {
                println("PhoneSetup: TelephonyManager error: ${e.message}")
            }
        }
        
    } catch (e: Exception) {
        println("PhoneSetup: Error reading SIM numbers: ${e.message}")
    }
    
    return SimDetectionResult(numbers.distinct(), hasActiveSim, hasReadableNumber)
}

data class SimDetectionResult(
    val numbers: List<String>,
    val hasActiveSim: Boolean,
    val canReadNumbers: Boolean
)

fun normalizeIndianMobileNumber(value: String?): String? {
    val digits = value.orEmpty().filter(Char::isDigit)
    if (digits.length < 10) return null

    val withoutCountryCode = when {
        digits.length == 12 && digits.startsWith("91") -> digits.drop(2)
        digits.length == 11 && digits.startsWith("0") -> digits.drop(1)
        digits.length > 10 -> digits.takeLast(10)
        else -> digits
    }

    return withoutCountryCode.takeIf { it.length == 10 }
}

fun hasSentSmsProof(context: Context, verificationCode: String, startedAt: Long): Boolean {
    val hasReadSms = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.READ_SMS
    ) == PackageManager.PERMISSION_GRANTED

    if (!hasReadSms) {
        println("PhoneSetup: Missing READ_SMS permission for sent SMS verification")
        return false
    }

    return try {
        val cursor = context.contentResolver.query(
            Uri.parse("content://sms/sent"),
            arrayOf("body", "date"),
            "date >= ?",
            arrayOf(startedAt.toString()),
            "date DESC"
        )

        cursor?.use {
            val bodyIndex = it.getColumnIndex("body")
            while (it.moveToNext()) {
                val body = if (bodyIndex >= 0) it.getString(bodyIndex).orEmpty() else ""
                if (body.contains(verificationCode)) {
                    println("PhoneSetup: Found sent SMS proof for verification code")
                    return true
                }
            }
        }

        false
    } catch (e: Exception) {
        println("PhoneSetup: Error checking sent SMS proof: ${e.message}")
        false
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhoneSetupScreen(
    onPhoneNumberConfirmed: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var phoneNumber by remember { mutableStateOf("") }
    var countryCode by remember { mutableStateOf("+91") }
    var isVerifying by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showSuccessDialog by remember { mutableStateOf(false) }
    var sentSmsCode by remember { mutableStateOf<String?>(null) }
    var sentSmsStartedAt by remember { mutableStateOf<Long?>(null) }
    var awaitingSentSmsProof by remember { mutableStateOf(false) }
    var simDetection by remember { mutableStateOf(SimDetectionResult(emptyList(), hasActiveSim = false, canReadNumbers = false)) }
    
    // Auto-detect SIM numbers on screen load
    LaunchedEffect(Unit) {
        simDetection = getSimNumbers(context)
        println("PhoneSetup: Detected ${simDetection.numbers.size} SIM numbers: ${simDetection.numbers}, active SIM: ${simDetection.hasActiveSim}, readable number: ${simDetection.canReadNumbers}")
    }

    LaunchedEffect(awaitingSentSmsProof, sentSmsCode, sentSmsStartedAt) {
        val code = sentSmsCode
        val startedAt = sentSmsStartedAt
        if (!awaitingSentSmsProof || code == null || startedAt == null) return@LaunchedEffect

        repeat(30) {
            delay(2000)
            if (hasSentSmsProof(context, code, startedAt)) {
                awaitingSentSmsProof = false
                isVerifying = false
                showSuccessDialog = true
                return@LaunchedEffect
            }
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Verify Phone Number") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
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
                imageVector = if (errorMessage != null) Icons.Default.Warning else Icons.Default.Phone,
                contentDescription = "Phone",
                modifier = Modifier.size(80.dp),
                tint = if (errorMessage != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Text(
                text = "Verify Your SIM Number",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "Enter the number for the SIM in this device. If Android cannot read the SIM number, the app will verify that this device can send an SMS from an inserted SIM.",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            
            if (simDetection.hasActiveSim || simDetection.numbers.isNotEmpty()) {
                Spacer(modifier = Modifier.height(16.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = if (simDetection.numbers.isNotEmpty()) {
                                "Detected SIM number(s): ${simDetection.numbers.size}"
                            } else {
                                "SIM detected"
                            },
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))
            
            // Country Code and Phone Number Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = countryCode,
                    onValueChange = { countryCode = it },
                    label = { Text("Code") },
                    modifier = Modifier.weight(0.3f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true
                )
                
                OutlinedTextField(
                    value = phoneNumber,
                    onValueChange = {
                        val digitsOnly = it.filter(Char::isDigit)
                        if (digitsOnly.length <= 10) phoneNumber = digitsOnly
                        errorMessage = null
                    },
                    label = { Text("Phone Number") },
                    modifier = Modifier.weight(0.7f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    isError = errorMessage != null,
                    placeholder = { Text("10-digit number") }
                )
            }
            
            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = errorMessage ?: "",
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            if (awaitingSentSmsProof) {
                Spacer(modifier = Modifier.height(12.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = "Android could not read the SIM number directly.",
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Tap the button below, send the prepared SMS from this device, then return here. Code: ${sentSmsCode.orEmpty()}",
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            fontSize = 13.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = {
                        val code = sentSmsCode
                        if (code == null) {
                            errorMessage = "Verification code expired. Try again."
                            awaitingSentSmsProof = false
                            return@Button
                        }
                        try {
                            val smsIntent = Intent(
                                Intent.ACTION_SENDTO,
                                Uri.parse("smsto:")
                            ).apply {
                                putExtra(
                                    "sms_body",
                                    "Auto OTP SIM verification code: $code"
                                )
                            }
                            context.startActivity(smsIntent)
                        } catch (e: Exception) {
                            errorMessage = "Could not open the SMS app. Please make sure an SMS app is installed."
                            println("PhoneSetup: Failed to open SMS app for sent proof: ${e.message}")
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Open SMS app")
                }

                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        val code = sentSmsCode
                        val startedAt = sentSmsStartedAt
                        if (code != null && startedAt != null && hasSentSmsProof(context, code, startedAt)) {
                            awaitingSentSmsProof = false
                            showSuccessDialog = true
                        } else {
                            errorMessage = "Sent SMS proof not found yet. Make sure the SMS was sent from this device."
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("I've Sent It - Check")
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Button(
                onClick = {
                    val normalizedPhoneNumber = normalizeIndianMobileNumber(phoneNumber)
                    when {
                        normalizedPhoneNumber == null -> {
                            errorMessage = "Please enter a valid 10-digit phone number"
                        }
                        simDetection.numbers.isNotEmpty() && !simDetection.numbers.contains(normalizedPhoneNumber) -> {
                            errorMessage = "This number does not match the readable SIM number on this device."
                            println("PhoneSetup: Number mismatch - Entered: $normalizedPhoneNumber, Available SIMs: ${simDetection.numbers}")
                        }
                        simDetection.numbers.contains(normalizedPhoneNumber) -> {
                            println("PhoneSetup: NUMBER VERIFIED - direct readable SIM match")
                            phoneNumber = normalizedPhoneNumber
                            showSuccessDialog = true
                        }
                        else -> {
                            phoneNumber = normalizedPhoneNumber
                            errorMessage = null
                            sentSmsCode = (100000..999999).random().toString()
                            sentSmsStartedAt = System.currentTimeMillis()
                            awaitingSentSmsProof = true
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = !isVerifying && !awaitingSentSmsProof && phoneNumber.length == 10
            ) {
                if (isVerifying) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                                    )
                } else {
                    Text("Verify Number", fontSize = 16.sp)
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            TextButton(
                onClick = {
                    // Refresh SIM detection
                    simDetection = getSimNumbers(context)
                    errorMessage = null
                }
            ) {
                Text("Refresh SIM Detection")
            }
        }
        
        if (showSuccessDialog) {
            AlertDialog(
                onDismissRequest = { },
                icon = {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = "Success",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(48.dp)
                    )
                },
                title = { Text("Verified!") },
                text = { Text("Your phone number has been verified successfully") },
                confirmButton = {
                    Button(
                        onClick = {
                            showSuccessDialog = false
                            val fullPhoneNumber = "${countryCode.filter { it == '+' || it.isDigit() }}$phoneNumber"
                            
                            // Save phone number to backend
                            scope.launch {
                                try {
                                    savePhoneNumberToBackend(context, fullPhoneNumber)
                                } catch (e: Exception) {
                                    println("PhoneSetup: Error saving phone to backend: ${e.message}")
                                }
                            }
                            
                            onPhoneNumberConfirmed(fullPhoneNumber)
                        }
                    ) {
                        Text("Continue")
                    }
                },
                containerColor = MaterialTheme.colorScheme.surface
            )
        }
    }
}

suspend fun savePhoneNumberToBackend(context: Context, phoneNumber: String) {
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        try {
            val deviceId = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            ) ?: "unknown"

            val baseUrl = com.example.BuildConfig.MONITORING_BASE_URL.trim().let {
                if (it.endsWith("/")) it else "$it/"
            }
            val url = "${baseUrl}api/activation-codes/save-phone"

            val json = org.json.JSONObject().apply {
                put("deviceId", deviceId)
                put("phoneNumber", phoneNumber)
            }

            val client = okhttp3.OkHttpClient.Builder()
                .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                .writeTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                .build()

            val requestBody = json.toString().toRequestBody(
                "application/json; charset=utf-8".toMediaTypeOrNull()
            )

            val request = okhttp3.Request.Builder()
                .url(url)
                .post(requestBody)
                .build()

            println("PhoneSetup: Saving phone number to backend: $url")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            println("PhoneSetup: Save phone response: ${response.code} - $responseBody")

            if (!response.isSuccessful) {
                println("PhoneSetup: Failed to save phone number to backend")
            }
        } catch (e: Exception) {
            println("PhoneSetup: Error saving phone to backend: ${e.message}")
            e.printStackTrace()
        }
    }
}
