"use client";

import { useEffect, useState } from "react";

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function OpsTransactionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

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
    load();
  }

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);

    fetch(`/api/ops/transactions?${params.toString()}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => setItems(data.transactions || []));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Transactions</h1>

      <div className="mt-6 flex gap-3">
        <input
          className="w-96 rounded-lg border border-slate-800 p-3"
          placeholder="Search txn, UTR, email, mobile"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="rounded-lg border border-slate-800 p-3"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>

        <button
          onClick={load}
          className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white"
        >
          Search
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800 text-slate-200">
            <tr>
              <th className="p-3 text-slate-300">Txn</th>
              <th className="p-3 text-slate-300">Merchant</th>
              <th className="p-3 text-slate-300">Amount</th>
              <th className="p-3 text-slate-300">Status</th>
              <th className="p-3 text-slate-300">Gateway</th>
              <th className="p-3 text-slate-300">UTR</th>
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
                <td className="p-3 text-slate-300">{item.status || "-"}</td>
                <td className="p-3 text-slate-300">{item.gateway || "-"}</td>
                <td className="p-3 text-slate-300">{item.utr || item.gatewayTransactionId || "-"}</td>
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
