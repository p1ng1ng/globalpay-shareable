"use client";

import { useEffect, useMemo, useState } from "react";

type Chargeback = {
  chargebackId: string;
  transactionId: string;
  paymentLinkId?: string | null;
  merchantEmail: string;
  customerName?: string;
  customerEmail?: string;
  amount: number;
  currency: string;
  reason: string;
  status: "open" | "under_review" | "won" | "lost";
  adminNote?: string;
  createdAt?: string;
  updatedAt?: string;
};

function formatMoney(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${currency || "INR"} ${amount || 0}`;
  }
}

function statusLabel(status: Chargeback["status"]) {
  if (status === "under_review") return "Under Review";
  if (status === "won") return "Won";
  if (status === "lost") return "Lost";
  return "Open";
}

function statusClass(status: Chargeback["status"]) {
  if (status === "won") return "text-green-400 bg-green-950 border-green-800";
  if (status === "lost") return "text-red-400 bg-red-950 border-red-800";
  if (status === "under_review")
    return "text-yellow-400 bg-yellow-950 border-yellow-800";
  return "text-blue-400 bg-blue-950 border-blue-800";
}

export default function MerchantChargebacksPage() {
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadChargebacks() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/chargebacks", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load chargebacks");
      }

      setChargebacks(data.chargebacks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chargebacks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChargebacks();
  }, []);

  const stats = useMemo(() => {
    return {
      open: chargebacks.filter((item) => item.status === "open").length,
      underReview: chargebacks.filter((item) => item.status === "under_review")
        .length,
      resolved: chargebacks.filter(
        (item) => item.status === "won" || item.status === "lost"
      ).length,
    };
  }, [chargebacks]);

  return (
    <main className="merchant-page min-h-screen bg-[#050917] px-5 py-7 text-white md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-300">
              Risk and disputes
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Chargebacks</h1>
            <p className="mt-3 text-sm text-slate-400">
              View customer chargeback cases for your merchant account.
            </p>
          </div>

          <button
            onClick={loadChargebacks}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500"
          >
            Refresh
          </button>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5">
            <p className="text-sm font-bold text-slate-400">Open Chargebacks</p>
            <p className="mt-2 text-3xl font-black">{stats.open}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5">
            <p className="text-sm font-bold text-slate-400">Under Review</p>
            <p className="mt-2 text-3xl font-black">{stats.underReview}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5">
            <p className="text-sm font-bold text-slate-400">Resolved</p>
            <p className="mt-2 text-3xl font-black">{stats.resolved}</p>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/80">
          {loading ? (
            <div className="p-6 text-slate-400">Loading chargebacks...</div>
          ) : chargebacks.length === 0 ? (
            <div className="p-6 text-slate-400">No chargebacks found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left">
                <thead className="bg-[#0b1220] text-slate-300">
                  <tr>
                    <th className="p-4">Case ID</th>
                    <th className="p-4">Transaction</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Reason</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {chargebacks.map((chargeback) => (
                    <tr
                      key={chargeback.chargebackId}
                      className="border-t border-white/10"
                    >
                      <td className="p-4 font-mono text-sm">
                        {chargeback.chargebackId}
                      </td>
                      <td className="p-4 font-mono text-sm">
                        {chargeback.transactionId}
                      </td>
                      <td className="p-4">
                        {formatMoney(chargeback.currency, chargeback.amount)}
                      </td>
                      <td className="p-4">
                        <div>{chargeback.reason}</div>
                        {chargeback.adminNote ? (
                          <div className="mt-1 text-xs text-slate-500">
                            Note: {chargeback.adminNote}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                            chargeback.status
                          )}`}
                        >
                          {statusLabel(chargeback.status)}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-400">
                        {chargeback.createdAt
                          ? new Date(chargeback.createdAt).toLocaleString()
                          : "-"}
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
