package com.example

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OtpReporterTest {
    @Test
    fun `does not upload messages before startup cutoff`() {
        assertFalse(OtpReporter.shouldUpload(timestamp = 999L, uploadCutoffTimestamp = 1000L))
    }

    @Test
    fun `uploads messages at or after startup cutoff`() {
        assertTrue(OtpReporter.shouldUpload(timestamp = 1000L, uploadCutoffTimestamp = 1000L))
        assertTrue(OtpReporter.shouldUpload(timestamp = 1001L, uploadCutoffTimestamp = 1000L))
    }
}
