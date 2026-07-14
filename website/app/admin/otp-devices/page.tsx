"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  alertsEnabled: boolean;
  createdAt: string;
}

interface Stats {
  total: number;
  online: number;
  offline: number;
}

export default function OtpDevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, online: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchDevices = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      
      const response = await fetch(`/api/admin/otp/devices?${params}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        console.error("Failed to fetch devices - HTTP", response.status);
        setDevices([]);
        setStats({ total: 0, online: 0, offline: 0 });
        return;
      }
      
      const data = await response.json();
      console.log("Devices data:", data);
      setDevices(data.devices || []);
      setStats(data.stats || { total: 0, online: 0, offline: 0 });
    } catch (error) {
      console.error("Failed to fetch devices:", error);
      setDevices([]);
      setStats({ total: 0, online: 0, offline: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [statusFilter]);

  const formatLastSeen = (age: number) => {
    if (age < 60) return `${age}s ago`;
    if (age < 3600) return `${Math.floor(age / 60)}m ago`;
    if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
    return `${Math.floor(age / 86400)}d ago`;
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            OTP Devices
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Monitor connected OTP devices and their status
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="bg-white dark:bg-[--color-surface] rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Total Devices
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.total}
                </p>
              </div>
              <div className="ml-4 flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[--color-surface] rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Online
                </p>
                <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
                  {stats.online}
                </p>
              </div>
              <div className="ml-4 flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[--color-surface] rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Offline
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-600 dark:text-gray-400">
                  {stats.offline}
                </p>
              </div>
              <div className="ml-4 flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white dark:bg-[--color-surface] rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Devices</option>
              <option value="online">Online Only</option>
              <option value="offline">Offline Only</option>
            </select>
          </div>
        </div>

        {/* Devices Table */}
        <div className="bg-white dark:bg-[--color-surface] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Phone Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Device
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Network
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Battery
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Last Seen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-[--color-surface] divide-y divide-gray-200 dark:divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                          No devices connected yet
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                          Open the Auto-OTP mobile app on your device. Grant all permissions and wait 60 seconds for the device to appear here automatically.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr 
                      key={device.id} 
                      onClick={() => router.push(`/admin/otp-devices/${device.deviceId}`)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              device.isOnline
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400"
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full mr-1.5 ${device.isOnline ? "bg-green-400" : "bg-gray-400"}`} />
                            {device.isOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {device.phoneNumber || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        <div className="font-medium">{device.deviceManufacturer} {device.deviceModel}</div>
                        <div className="text-gray-500 dark:text-gray-400">Android {device.osVersion}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {device.networkType || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {device.batteryLevel ? `${device.batteryLevel}%` : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatLastSeen(device.lastSeenAge)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {device.latitude && device.longitude ? (
                          <a
                            href={`https://maps.google.com/?q=${device.latitude},${device.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            View Map
                          </a>
                        ) : (
                          "-"
                        )}
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

