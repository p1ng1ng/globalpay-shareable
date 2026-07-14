"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Send } from "lucide-react";

type PayoutRecord = {
  payoutId: string;
  merchantEmail: string;
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
  amount: number;
  merchantFeeAmount: number;
  merchantFeePercent: number;
  grossProfitAmount: number;
  status: string;
  provider: string;
  providerTxnId: string;
  utr: string;
  createdAt?: string;
};

function money(value: unknown) {
  return `INR ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function statusClass(status: string) {
  const value = String(status || "").toLowerCase();
  if (["paid", "success", "completed"].includes(value)) {
    return "border-emerald-300 bg-emerald-100 text-emerald-700";
  }
  if (["failed", "failure", "cancelled"].includes(value)) {
    return "border-red-300 bg-red-50 text-red-700";
  }
  if (["processing", "queued"].includes(value)) {
    return "border-blue-300 bg-blue-50 text-blue-700";
  }
  return "border-amber-400/30 bg-amber-50 text-amber-700";
}

function shortDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminFinancePayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  async function loadPayouts() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/admin/finance/payouts", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Payout load failed");
      setPayouts(data.payouts || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payout load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadPayouts();
    });
  }, []);

  const stats = useMemo(() => {
    const pending = payouts.filter((item) => ["pending", "processing"].includes(String(item.status || "").toLowerCase()));
    const paid = payouts.filter((item) => ["paid", "success", "completed"].includes(String(item.status || "").toLowerCase()));
    const failed = payouts.filter((item) => ["failed", "failure", "cancelled"].includes(String(item.status || "").toLowerCase()));
    return [
      { label: "In provider flow", value: money(pending.reduce((sum, item) => sum + Number(item.amount || 0), 0)), note: `${pending.length} active`, tone: "text-amber-700" },
      { label: "Paid through providers", value: money(paid.reduce((sum, item) => sum + Number(item.amount || 0), 0)), note: `${paid.length} paid`, tone: "text-emerald-700" },
      { label: "Failed", value: money(failed.reduce((sum, item) => sum + Number(item.amount || 0), 0)), note: `${failed.length} failed`, tone: "text-red-700" },
      { label: "Payout profit", value: money(paid.reduce((sum, item) => sum + Number(item.grossProfitAmount || 0), 0)), note: "Fee less provider cost", tone: "text-blue-700" },
    ];
  }, [payouts]);

  async function payoutAction(payoutId: string, action: "submit" | "status", provider: "rockypayz" | "rupayex" | "alosheell") {
    try {
      setWorkingId(`${provider}:${action}:${payoutId}`);
      setMessage("");
      const response = await fetch(`/api/admin/finance/payouts/${encodeURIComponent(payoutId)}/${provider}-${action === "submit" ? "submit" : "status"}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Payout action failed");
      setMessage(data.message || "Payout updated");
      await loadPayouts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payout action failed");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main>
      <div className="mx-auto max-w-[1500px] px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">
              Finance operations
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Provider payout monitor</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Track direct merchant payout submissions, provider responses, UTRs, and failed transfers.
            </p>
          </div>

          <button
            onClick={loadPayouts}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-black hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-600">{item.label}</p>
              <p className={`mt-3 text-2xl font-black ${item.tone}`}>{item.value}</p>
              <p className="mt-2 text-xs font-semibold text-gray-500">{item.note}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-black">Payout requests</h2>
              <p className="text-sm text-gray-600">Merchant requests are submitted directly to the assigned provider route.</p>
            </div>
            <span className="rounded bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700">
              {payouts.length} total
            </span>
          </div>

          {loading ? (
            <p className="py-10 text-gray-600">Loading payouts...</p>
          ) : payouts.length === 0 ? (
            <p className="py-10 text-gray-600">No payout requests found.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-[0.16em] text-gray-500">
                  <tr>
                    <th className="px-4 py-4">Payout</th>
                    <th className="px-4 py-4">Merchant</th>
                    <th className="px-4 py-4">Beneficiary</th>
                    <th className="px-4 py-4 text-right">Amount</th>
                    <th className="px-4 py-4 text-right">Fee</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4">Provider</th>
                    <th className="px-4 py-4">UTR</th>
                    <th className="px-4 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {payouts.map((item) => {
                    const canSubmit = ["pending", "processing"].includes(String(item.status || "").toLowerCase());
                    const providerName = String(item.provider || "").toLowerCase();
                    const provider = providerName.includes("alosheell")
                      ? "alosheell"
                      : providerName.includes("rupayex")
                        ? "rupayex"
                        : "rockypayz";
                    const rockySubmitBusy = workingId === `rockypayz:submit:${item.payoutId}`;
                    const rupaySubmitBusy = workingId === `rupayex:submit:${item.payoutId}`;
                    const alosheellSubmitBusy = workingId === `alosheell:submit:${item.payoutId}`;
                    const statusBusy = workingId === `${provider}:status:${item.payoutId}`;

                    return (
                      <tr key={item.payoutId} className="hover:bg-white/[0.03]">
                        <td className="px-4 py-4">
                          <p className="font-black">{item.payoutId}</p>
                          <p className="text-xs text-gray-500">{shortDate(item.createdAt)}</p>
                        </td>
                        <td className="px-4 py-4 text-gray-700">{item.merchantEmail}</td>
                        <td className="px-4 py-4">
                          <p className="font-bold text-gray-700">{item.beneficiaryName}</p>
                          <p className="text-xs text-gray-500">{item.accountNumber} · {item.ifsc}</p>
                        </td>
                        <td className="px-4 py-4 text-right font-black">{money(item.amount)}</td>
                        <td className="px-4 py-4 text-right">
                          <p className="font-bold text-gray-700">{money(item.merchantFeeAmount)}</p>
                          <p className="text-xs text-gray-500">{Number(item.merchantFeePercent || 0)}%</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-lg border px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>
                            {item.status || "pending"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-bold text-gray-700">{item.provider || "-"}</p>
                          <p className="text-xs text-gray-500">{item.providerTxnId || "-"}</p>
                        </td>
                        <td className="px-4 py-4 text-gray-700">{item.utr || "-"}</td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              disabled={!canSubmit || rockySubmitBusy}
                              onClick={() => payoutAction(item.payoutId, "submit", "rockypayz")}
                              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-gray-900 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {rockySubmitBusy ? "Retrying" : "Retry Rocky"}
                            </button>
                            <button
                              disabled={!canSubmit || rupaySubmitBusy}
                              onClick={() => payoutAction(item.payoutId, "submit", "rupayex")}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-gray-900 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {rupaySubmitBusy ? "Retrying" : "Retry RupayEx"}
                            </button>
                            <button
                              disabled={!canSubmit || alosheellSubmitBusy}
                              onClick={() => payoutAction(item.payoutId, "submit", "alosheell")}
                              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-black text-gray-900 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {alosheellSubmitBusy ? "Retrying" : "Retry Alosheell"}
                            </button>
                            <button
                              disabled={statusBusy}
                              onClick={() => payoutAction(item.payoutId, "status", provider)}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {statusBusy ? "Refreshing" : "Status"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


