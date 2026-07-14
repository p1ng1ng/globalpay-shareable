"use client";

import { useEffect, useState } from "react";

type DashboardData = {
  success: boolean;
  summary?: Record<string, number>;
  latestFailed?: any[];
  latestPending?: any[];
};

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function txnLabel(item: any) {
  return item.txnId || item.transactionId || item.paymentId || item._id || "-";
}

export default function OpsDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  function loadDashboard() {
    setLoading(true);

    fetch("/api/ops/dashboard", { credentials: "include" })
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const summary = data?.summary || {};

  const cards = [
    {
      label: "Today Volume",
      value: money(summary.todaySuccessVolume || 0),
      note: "Successful collection",
    },
    {
      label: "Success Today",
      value: summary.todaySuccessCount || 0,
      note: "Completed payments",
    },
    {
      label: "Failed Today",
      value: summary.todayFailedCount || 0,
      note: "Failed payments",
    },
    {
      label: "Pending Payments",
      value: summary.pendingPaymentsCount || 0,
      note: "Need tracking",
    },
    {
      label: "Payout Pending",
      value: money(summary.payoutPendingAmount || 0),
      note: `${summary.payoutPendingCount || 0} requests`,
    },
    {
      label: "Payout Paid",
      value: money(summary.payoutPaidAmount || 0),
      note: `${summary.payoutPaidCount || 0} requests`,
    },
    {
      label: "PG Settlement Pending",
      value: summary.pgSettlementPendingCount || 0,
      note: "Gateway settlement",
    },
    {
      label: "Access",
      value: "Read Only",
      note: "Ops role",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">
              Ops Dashboard
            </h1>
            <p className="mt-2 text-slate-400">
              Read-only operations view for office staff.
            </p>
          </div>

          <button
            onClick={loadDashboard}
            className="rounded-xl border border-slate-800 border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-800 border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20"
            >
              <div className="text-sm font-semibold text-slate-400">
                {card.label}
              </div>
              <div className="mt-3 text-3xl font-black text-white">
                {card.value}
              </div>
              <div className="mt-2 text-xs font-medium text-slate-400">
                {card.note}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white">
                Latest Failed Payments
              </h2>
              <span className="rounded-full bg-red-950 px-3 py-1 text-xs font-bold text-red-300">
                Failed
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {(data?.latestFailed || []).length === 0 ? (
                <div className="rounded-xl border border-slate-800 border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  No failed payments found.
                </div>
              ) : (
                (data?.latestFailed || []).map((item) => (
                  <div
                    key={item._id}
                    className="rounded-xl border border-slate-800 border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="font-bold text-white">{txnLabel(item)}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {item.merchantEmail || "-"} · {money(item.amount || 0)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white">
                Latest Pending Payments
              </h2>
              <span className="rounded-full bg-yellow-950 px-3 py-1 text-xs font-bold text-yellow-300">
                Pending
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {(data?.latestPending || []).length === 0 ? (
                <div className="rounded-xl border border-slate-800 border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  No pending payments found.
                </div>
              ) : (
                (data?.latestPending || []).map((item) => (
                  <div
                    key={item._id}
                    className="rounded-xl border border-slate-800 border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="font-bold text-white">{txnLabel(item)}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {item.merchantEmail || "-"} · {money(item.amount || 0)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
