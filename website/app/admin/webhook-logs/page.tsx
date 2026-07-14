"use client";

import { useEffect, useState } from "react";

type WebhookLog = {
  id: string;
  gateway: string;
  eventType: string;
  transactionId: string;
  status: string;
  receivedTime: string;
  payload: Record<string, string>;
};

export default function AdminWebhookLogsPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [selectedPayload, setSelectedPayload] = useState<Record<string, string> | null>(
    null
  );

  useEffect(() => {
    const saved = localStorage.getItem("Wpay_webhook_logs");
    const savedLogs = saved ? JSON.parse(saved) : [];

    const sampleLogs: WebhookLog[] = [
      {
        id: "LOG_1001",
        gateway: "Razorpay",
        eventType: "payment.captured",
        transactionId: "txn_1001",
        status: "Success",
        receivedTime: "2026-06-13 20:41",
        payload: {
          event: "payment.captured",
          transaction_id: "txn_1001",
          status: "success",
          gateway: "razorpay",
          amount: "2499",
          method: "UPI",
        },
      },
      {
        id: "LOG_1002",
        gateway: "Cashfree",
        eventType: "payment.pending",
        transactionId: "txn_1003",
        status: "Received",
        receivedTime: "2026-06-13 20:35",
        payload: {
          event: "payment.pending",
          transaction_id: "txn_1003",
          status: "pending",
          gateway: "cashfree",
          amount: "4999",
          method: "Net Banking",
        },
      },
    ];

    setLogs([...savedLogs, ...sampleLogs]);
    setSelectedPayload(savedLogs[0]?.payload || sampleLogs[0].payload);
  }, []);

  function clearDemoWebhookLogs() {
    localStorage.removeItem("Wpay_webhook_logs");
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <a href="/admin/dashboard" className="text-sm font-semibold text-blue-600">
            ← Back to Dashboard
          </a>

          <h1 className="text-3xl font-bold text-slate-900 mt-4">
            Webhook Logs
          </h1>

          <p className="text-gray-500 mt-1">
            View gateway webhook events received by Wpay.
          </p>
        </div>

        <button
          onClick={clearDemoWebhookLogs}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Clear Demo Logs
        </button>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Logs</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-2">
            {logs.length}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Captured</p>
          <h2 className="text-2xl font-bold text-green-700 mt-2">
            {logs.filter((log) => log.eventType === "payment.captured").length}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Pending</p>
          <h2 className="text-2xl font-bold text-yellow-700 mt-2">
            {logs.filter((log) => log.eventType === "payment.pending").length}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Failed</p>
          <h2 className="text-2xl font-bold text-red-700 mt-2">
            {logs.filter((log) => log.eventType === "payment.failed").length}
          </h2>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl bg-white p-6 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-3">Log ID</th>
                <th>Gateway</th>
                <th>Event</th>
                <th>Transaction</th>
                <th>Status</th>
                <th>Received</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="py-4 text-slate-700">{log.id}</td>
                  <td className="py-4 text-slate-700">{log.gateway}</td>
                  <td className="py-4 text-slate-700">{log.eventType}</td>
                  <td className="py-4 text-slate-700">{log.transactionId}</td>
                  <td className="py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        log.status === "Success"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="py-4 text-slate-700">{log.receivedTime}</td>
                  <td className="py-4">
                    <button
                      onClick={() => setSelectedPayload(log.payload)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-gray-900"
                    >
                      View Payload
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl bg-gray-50 p-6 text-gray-900 shadow-sm">
          <h2 className="font-bold mb-4">Payload Preview</h2>

          <pre className="overflow-x-auto rounded-xl bg-white p-4 text-xs text-gray-700">
            {JSON.stringify(selectedPayload, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}

