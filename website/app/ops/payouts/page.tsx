"use client";

import { useEffect, useState } from "react";

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function OpsPayoutsPage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/ops/payouts", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setItems(data.payouts || []));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Payout Settlements</h1>
      <p className="mt-2 text-slate-400">Read-only payout and bank operation view.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800 text-slate-200">
            <tr>
              <th className="p-3 text-slate-300">Payout ID</th>
              <th className="p-3 text-slate-300">Merchant</th>
              <th className="p-3 text-slate-300">Amount</th>
              <th className="p-3 text-slate-300">Status</th>
              <th className="p-3 text-slate-300">Provider</th>
              <th className="p-3 text-slate-300">UTR</th>
              <th className="p-3 text-slate-300">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-t border-slate-800">
                <td className="p-3 text-slate-300">{item.payoutId || item._id}</td>
                <td className="p-3 text-slate-300">{item.merchantEmail || "-"}</td>
                <td className="p-3 text-slate-300">{money(item.amount || 0)}</td>
                <td className="p-3 text-slate-300">{item.status || "-"}</td>
                <td className="p-3 text-slate-300">{item.provider || "-"}</td>
                <td className="p-3 text-slate-300">{item.utr || item.providerTxnId || "-"}</td>
                <td className="p-3 text-slate-300">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
