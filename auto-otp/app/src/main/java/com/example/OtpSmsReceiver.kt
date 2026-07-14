package com.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.example.data.OtpDatabase
import com.example.data.OtpMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class OtpSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val dao = OtpDatabase.getDatabase(context.applicationContext).otpMessageDao()
                Telephony.Sms.Intents.getMessagesFromIntent(intent).forEach { message ->
                    val body = message?.messageBody ?: return@forEach
                    val sender = message.originatingAddress ?: "Unknown"
                    val timestamp = message.timestampMillis
                    val otp = OTP_REGEX.find(body)?.value ?: return@forEach
                    if (dao.getMessageByTimestamp(timestamp) != null) return@forEach

                    println("OtpSmsReceiver: Forwarding SMS OTP $otp from $sender")
                    val messageId = dao.insertMessage(
                        OtpMessage(
                            sender = sender,
                            messageBody = body,
                            otpCode = otp,
                            timestamp = timestamp,
                            isRead = false
                        )
                    )
                    val sent = OtpReporter.report(context.applicationContext, otp, sender, body, timestamp, "sms")
                    dao.updateServerSent(messageId, sent)
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    private companion object {
        val OTP_REGEX = Regex("\\b\\d{4,8}\\b")
    }
}
