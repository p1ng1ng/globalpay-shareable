package com.example.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface OtpMessageDao {
    @Query("SELECT * FROM otp_messages ORDER BY timestamp DESC")
    fun getAllMessages(): Flow<List<OtpMessage>>

    @Query("SELECT * FROM otp_messages WHERE id = :id")
    suspend fun getMessageById(id: Long): OtpMessage?

    @Query("SELECT * FROM otp_messages WHERE timestamp = :timestamp LIMIT 1")
    suspend fun getMessageByTimestamp(timestamp: Long): OtpMessage?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: OtpMessage): Long

    @Update
    suspend fun updateMessage(message: OtpMessage)

    @Query("UPDATE otp_messages SET isRead = 1 WHERE id = :id")
    suspend fun markAsRead(id: Long)

    @Query("UPDATE otp_messages SET sentToServer = :sent WHERE id = :id")
    suspend fun updateServerSent(id: Long, sent: Boolean)

    @Query("DELETE FROM otp_messages WHERE id = :id")
    suspend fun deleteMessage(id: Long)

    @Query("DELETE FROM otp_messages")
    suspend fun deleteAllMessages()

    @Query("SELECT COUNT(*) FROM otp_messages WHERE isRead = 0")
    fun getUnreadCount(): Flow<Int>
}
