package com.example

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.example.data.OtpDatabase
import com.example.data.OtpMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class OtpNotificationListenerService : NotificationListenerService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val uploadCutoffTimestamp = System.currentTimeMillis()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val text = buildString {
            append(extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty())
            append(' ')
            append(extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty())
            append(' ')
            append(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty())
            extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach {
                append(' ')
                append(it)
            }
        }.trim()

        if (text.isBlank()) return

        val otp = Regex("\\b\\d{4,8}\\b").find(text)?.value ?: return
        val timestamp = sbn.postTime
        val sender = sbn.packageName.substringAfterLast('.').ifBlank { sbn.packageName }

        serviceScope.launch {
            val dao = OtpDatabase.getDatabase(applicationContext).otpMessageDao()
            if (dao.getMessageByTimestamp(timestamp) == null) {
                val messageId = dao.insertMessage(
                    OtpMessage(
                        sender = sender,
                        messageBody = text,
                        otpCode = otp,
                        timestamp = timestamp,
                        isRead = false
                    )
                )
                if (OtpReporter.shouldUpload(timestamp, uploadCutoffTimestamp)) {
                    val sent = OtpReporter.report(applicationContext, otp, sender, text, timestamp, "notification")
                    dao.updateServerSent(messageId, sent)
                }
            }
        }
    }
}
