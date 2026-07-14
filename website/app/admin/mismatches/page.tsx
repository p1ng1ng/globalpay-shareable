"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Mismatch = {
  issue: string;
  transactionId: string;
  paymentLinkId: string;
  merchantEmail: string;
  amount: number;
  currency: string;
  transactionStatus: string;
  paymentLinkStatus: string;
  gatewayTransactionId?: string | null;
  utr?: string | null;
  createdAt?: string;
};

function money(currency: string, amount: number) {
  return `${currency || "INR"} ${Number(amount || 0).toLocaleString("en-IN")}`;
}

export default function AdminMismatchesPage() {
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadMismatches() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/admin/mismatches", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!data.success) {
        setMessage(data.message || "Failed to load mismatches");
        return;
      }

      setMismatches(data.mismatches || []);
    } catch {
      setMessage("Failed to load mismatches");
    } finally {
      setLoading(false);
    }
  }

  async function fixTransaction(transactionId: string, status: "success" | "failed") {
    const adminNote = window.prompt(
      `Enter admin note for correcting ${transactionId} to ${status}:`
    );

    if (!adminNote) return;

    const response = await fetch("/api/admin/mismatches/fix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        transactionId,
        status,
        adminNote,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      alert(data.message || "Failed to fix transaction");
      return;
    }

    alert("Transaction corrected successfully");
    await loadMismatches();
  }

  useEffect(() => {
    loadMismatches();
  }, []);

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-black">Payment Status Mismatches</h1>
            <p className="mt-2 text-gray-400">
              Find and correct cases where transaction status and payment link status do not match.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={loadMismatches}
              className="rounded-xl border border-gray-200 bg-white px-5 py-3 font-bold hover:bg-gray-800"
            >
              Refresh
            </button>

            <Link
              href="/admin/dashboard"
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-700"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-100">
            {message}
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <p className="font-bold">
              Found: <span className="text-yellow-300">{mismatches.length}</span>
            </p>
          </div>

          {loading ? (
            <p className="p-8 text-gray-400">Loading mismatches...</p>
          ) : mismatches.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-3xl">✅</p>
              <p className="mt-3 text-xl font-black">No mismatches found</p>
              <p className="mt-2 text-gray-400">All checked payment statuses look clean.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-800 text-gray-300">
                  <tr>
                    <th className="p-4">Issue</th>
                    <th className="p-4">Transaction</th>
                    <th className="p-4">Payment Link</th>
                    <th className="p-4">Merchant</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Txn Status</th>
                    <th className="p-4">Link Status</th>
                    <th className="p-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mismatches.map((item) => (
                    <tr key={item.transactionId} className="border-t border-gray-200">
                      <td className="p-4 text-yellow-200">{item.issue}</td>
                      <td className="p-4 font-mono">{item.transactionId}</td>
                      <td className="p-4 font-mono">{item.paymentLinkId}</td>
                      <td className="p-4">{item.merchantEmail}</td>
                      <td className="p-4">{money(item.currency, item.amount)}</td>
                      <td className="p-4">{item.transactionStatus}</td>
                      <td className="p-4">{item.paymentLinkStatus}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => fixTransaction(item.transactionId, "success")}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black hover:bg-emerald-700"
                          >
                            Mark Success
                          </button>
                          <button
                            onClick={() => fixTransaction(item.transactionId, "failed")}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black hover:bg-red-700"
                          >
                            Mark Failed
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

