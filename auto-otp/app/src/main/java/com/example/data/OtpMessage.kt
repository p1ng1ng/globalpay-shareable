package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "otp_messages")
data class OtpMessage(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val sender: String,
    val messageBody: String,
    val otpCode: String,
    val timestamp: Long,
    val isRead: Boolean = false,
    val sentToServer: Boolean = false
)
