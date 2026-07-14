"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AuditLog = {
  _id: string;
  action: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  merchantName: string;
  merchantEmail: string;
  targetType: string;
  targetId: string;
  status: string;
  message: string;
  createdAt: string;
};

export default function AdminAuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/admin/audit-logs", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to load audit logs");
        return;
      }

      setAuditLogs(data.auditLogs || []);
    } catch {
      setMessage("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  useEffect(() => {
    // Initial audit-log hydration is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAuditLogs();
  }, []);

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-600">
              Wpay Admin
            </p>
            <h1 className="text-4xl font-black">Audit Logs</h1>
            <p className="mt-2 text-gray-600">
              Track security and business actions across Wpay.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadAuditLogs}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Refresh
            </button>

            <Link
              href="/admin/dashboard"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Dashboard
            </Link>

            <button
              onClick={logout}
              className="rounded-xl border border-red-300 px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-100">
            {message}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-black">Latest 200 Events</h2>
          </div>

          {loading ? (
            <div className="p-8 text-gray-700">Loading audit logs...</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-8 text-gray-700">No audit logs found yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-5 py-4">Time</th>
                    <th className="px-5 py-4">Action</th>
                    <th className="px-5 py-4">Actor</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Merchant</th>
                    <th className="px-5 py-4">Target</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Message</th>
                  </tr>
                </thead>

                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="border-t border-gray-200">
                      <td className="px-5 py-4 text-gray-700">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 font-black text-blue-700">
                        {log.action}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold">{log.actorName || "-"}</p>
                        <p className="text-xs text-gray-600">{log.actorEmail || "-"}</p>
                      </td>
                      <td className="px-5 py-4">{log.actorRole}</td>
                      <td className="px-5 py-4">
                        <p className="font-bold">{log.merchantName || "-"}</p>
                        {log.merchantEmail ? (
                          <p className="text-xs text-gray-600">{log.merchantEmail}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <p>{log.targetType || "-"}</p>
                        <p className="text-xs text-gray-600">{log.targetId || "-"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            log.status === "success"
                              ? "bg-emerald-100 text-emerald-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-700">{log.message || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

