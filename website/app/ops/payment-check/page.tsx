"use client";

import { useState } from "react";

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function OpsPaymentCheckPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function search() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/ops/payment-check?q=${encodeURIComponent(q)}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!data.success) {
        setMessage(data.message || "Search failed");
        setTransactions([]);
        setPaymentLinks([]);
        return;
      }

      setTransactions(data.transactions || []);
      setPaymentLinks(data.paymentLinks || []);

      if ((data.transactions || []).length === 0 && (data.paymentLinks || []).length === 0) {
        setMessage("No matching payment found");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">Payment Check</h1>
      <p className="mt-2 text-slate-400">
        Search payment by transaction ID, payment link ID, UTR, mobile, email, or provider reference.
      </p>

      <div className="mt-6 flex gap-3">
        <input
          className="w-[520px] rounded-lg border border-slate-800 border-slate-700 bg-slate-900 p-3"
          placeholder="Enter transaction ID / UTR / mobile / email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />

        <button
          onClick={search}
          disabled={loading}
          className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Checking..." : "Check Payment"}
        </button>
      </div>

      {message ? (
        <div className="mt-5 rounded-lg border border-slate-800 border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
          {message}
        </div>
      ) : null}

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow">
        <h2 className="text-xl font-bold text-white">Transactions</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800 text-slate-200">
              <tr>
                <th className="p-3 text-slate-300">Txn</th>
                <th className="p-3 text-slate-300">Merchant</th>
                <th className="p-3 text-slate-300">Amount</th>
                <th className="p-3 text-slate-300">Status</th>
                <th className="p-3 text-slate-300">Gateway</th>
                <th className="p-3 text-slate-300">Provider Ref / UTR</th>
                <th className="p-3 text-slate-300">Created</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((item) => (
                <tr key={item._id} className="border-t border-slate-800">
                  <td className="p-3 font-semibold text-white">
                    {item.txnId || item.transactionId || item.paymentId || item._id}
                  </td>
                  <td className="p-3 text-slate-300">{item.merchantEmail || "-"}</td>
                  <td className="p-3 text-slate-300">{money(item.amount || 0)}</td>
                  <td className="p-3 text-slate-300">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold">
                      {item.status || "-"}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300">{item.gateway || "-"}</td>
                  <td className="p-3 text-slate-300">
                    {item.utr ||
                      item.gatewayTransactionId ||
                      item.gatewayReferenceNo ||
                      item.providerTxnId ||
                      "-"}
                  </td>
                  <td className="p-3 text-slate-300">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}

              {transactions.length === 0 ? (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={7}>
                    No transactions loaded
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow">
        <h2 className="text-xl font-bold text-white">Payment Links</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800 text-slate-200">
              <tr>
                <th className="p-3 text-slate-300">Link ID</th>
                <th className="p-3 text-slate-300">Merchant</th>
                <th className="p-3 text-slate-300">Amount</th>
                <th className="p-3 text-slate-300">Status</th>
                <th className="p-3 text-slate-300">Customer</th>
                <th className="p-3 text-slate-300">UTR</th>
                <th className="p-3 text-slate-300">Created</th>
              </tr>
            </thead>
            <tbody>
              {paymentLinks.map((item) => (
                <tr key={item._id} className="border-t border-slate-800">
                  <td className="p-3 font-semibold text-white">{item.linkId || item.paymentLinkId || item._id}</td>
                  <td className="p-3 text-slate-300">{item.merchantEmail || "-"}</td>
                  <td className="p-3 text-slate-300">{money(item.amount || 0)}</td>
                  <td className="p-3 text-slate-300">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold">
                      {item.status || "-"}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300">
                    {item.customerEmail || item.customerMobile || item.customerPhone || "-"}
                  </td>
                  <td className="p-3 text-slate-300">
                    {item.utr || item.gatewayTransactionId || item.gatewayReferenceNo || "-"}
                  </td>
                  <td className="p-3 text-slate-300">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}

              {paymentLinks.length === 0 ? (
                <tr>
                  <td className="p-4 text-slate-400" colSpan={7}>
                    No payment links loaded
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
