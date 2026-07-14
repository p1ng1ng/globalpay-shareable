"use client";

import { useEffect, useState } from "react";

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function OpsPendingPaymentsPage() {
  const [items, setItems] = useState<any[]>([]);

  async function refreshStatus(item: any) {
    const id = item._id || item.txnId || item.transactionId || item.paymentId;

    if (!id) {
      alert("Missing transaction ID");
      return;
    }

    const res = await fetch(`/api/ops/transactions/${encodeURIComponent(id)}/refresh-status`, {
      method: "POST",
      credentials: "include",
    });

    const data = await res.json();
    alert(data.message || (data.success ? "Status refreshed" : "Refresh failed"));

    fetch("/api/ops/transactions?status=pending", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => setItems(data.transactions || []));
  }

  useEffect(() => {
    fetch("/api/ops/transactions?status=pending", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => setItems(data.transactions || []));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Pending Payments</h1>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800 text-slate-200">
            <tr>
              <th className="p-3 text-slate-300">Txn</th>
              <th className="p-3 text-slate-300">Merchant</th>
              <th className="p-3 text-slate-300">Amount</th>
              <th className="p-3 text-slate-300">Gateway</th>
              <th className="p-3 text-slate-300">Created</th>
              <th className="p-3 text-slate-300">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-t border-slate-800">
                <td className="p-3 text-slate-300">{item.txnId || item.transactionId || item.paymentId || item._id}</td>
                <td className="p-3 text-slate-300">{item.merchantEmail || "-"}</td>
                <td className="p-3 text-slate-300">{money(item.amount || 0)}</td>
                <td className="p-3 text-slate-300">{item.gateway || "-"}</td>
                <td className="p-3 text-slate-300">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</td>
                <td className="p-3 text-slate-300">
                  <button
                    onClick={() => refreshStatus(item)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Refresh Status
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
