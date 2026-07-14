"use client";

import { useEffect, useState } from "react";

export default function OpsWebhookLogsPage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/ops/webhook-logs", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setItems(data.logs || []));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Webhook Logs</h1>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800 text-slate-200">
            <tr>
              <th className="p-3 text-slate-300">Event</th>
              <th className="p-3 text-slate-300">Status</th>
              <th className="p-3 text-slate-300">Reference</th>
              <th className="p-3 text-slate-300">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-t border-slate-800">
                <td className="p-3 text-slate-300">{item.event || item.type || item.gateway || "-"}</td>
                <td className="p-3 text-slate-300">{item.status || "-"}</td>
                <td className="p-3 text-slate-300">{item.txnId || item.transactionId || item.referenceId || "-"}</td>
                <td className="p-3 text-slate-300">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
