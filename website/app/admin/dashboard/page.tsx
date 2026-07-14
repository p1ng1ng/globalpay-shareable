"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type VolumeRange = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

type Transaction = {
  _id?: string;
  transactionId?: string;
  merchantRefId?: string;
  providerOrderId?: string;
  gatewayTransactionId?: string;
  amount?: number | string;
  status?: string;
  gateway?: string;
  merchantEmail?: string;
  createdAt?: string;
  updatedAt?: string;
};

type DashboardSummary = {
  totalTransactions: number;
  successful: number;
  failed: number;
  successAmount: number;
  failedAmount: number;
  totalVolume: number;
  successRate: number;
  activeMerchants: number;
};

type TransactionsResponse = {
  success?: boolean;
  message?: string;
  transactions?: unknown;
  data?: unknown;
  items?: unknown;
  results?: unknown;
};

const volumeRanges: { key: VolumeRange; label: string }[] = [
  { key: "hourly", label: "Hourly" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatTxnDate(value?: string) {
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

function isSuccess(status?: string) {
  const s = String(status || "").toLowerCase();
  return ["paid", "success", "successful", "completed", "captured"].includes(s);
}

function isFailed(status?: string) {
  const s = String(status || "").toLowerCase();
  return ["failed", "failure", "cancelled", "canceled", "rejected", "declined"].includes(s);
}

function amountOf(transaction: Transaction) {
  const value = transaction.amount;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const normalized = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeTransactions(data: TransactionsResponse): Transaction[] {
  if (Array.isArray(data.transactions)) return data.transactions as Transaction[];
  if (Array.isArray(data.data)) return data.data as Transaction[];
  if (Array.isArray(data.items)) return data.items as Transaction[];
  if (Array.isArray(data.results)) return data.results as Transaction[];
  return [];
}

function summarizeTransactions(rows: Transaction[]): DashboardSummary {
  const successRows = rows.filter((t) => isSuccess(t.status));
  const failedRows = rows.filter((t) => isFailed(t.status));
  const successAmount = successRows.reduce((sum, t) => sum + amountOf(t), 0);
  const failedAmount = failedRows.reduce((sum, t) => sum + amountOf(t), 0);
  const totalVolume = rows.reduce((sum, t) => sum + amountOf(t), 0);
  const totalTransactions = rows.length;

  return {
    totalTransactions,
    successful: successRows.length,
    failed: failedRows.length,
    successAmount,
    failedAmount,
    totalVolume,
    successRate: totalTransactions > 0 ? (successRows.length / totalTransactions) * 100 : 0,
    activeMerchants: new Set(rows.map((t) => t.merchantEmail).filter(Boolean)).size,
  };
}

function statusBadge(status?: string) {
  if (isSuccess(status)) return "bg-emerald-100 text-emerald-600";
  if (isFailed(status)) return "bg-red-50 text-red-600";
  return "bg-amber-50 text-amber-600";
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function bucketFor(date: Date, range: VolumeRange) {
  if (range === "hourly") {
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`,
      label: `${String(date.getHours()).padStart(2, "0")}:00`,
    };
  }

  if (range === "daily") {
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      label: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    };
  }

  if (range === "weekly") {
    const start = startOfWeek(date);
    return {
      key: `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`,
      label: `Week ${start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
    };
  }

  if (range === "monthly") {
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    };
  }

  return {
    key: `${date.getFullYear()}`,
    label: String(date.getFullYear()),
  };
}

function emptyBuckets(range: VolumeRange) {
  const now = new Date();
  const count =
    range === "hourly" ? 24 : range === "daily" ? 14 : range === "weekly" ? 10 : range === "monthly" ? 12 : 5;

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);

    if (range === "hourly") date.setHours(now.getHours() - (count - 1 - index), 0, 0, 0);
    if (range === "daily") date.setDate(now.getDate() - (count - 1 - index));
    if (range === "weekly") date.setDate(now.getDate() - (count - 1 - index) * 7);
    if (range === "monthly") date.setMonth(now.getMonth() - (count - 1 - index), 1);
    if (range === "yearly") date.setFullYear(now.getFullYear() - (count - 1 - index), 0, 1);

    return { ...bucketFor(date, range), volume: 0, success: 0, failed: 0 };
  });
}

export default function AdminDashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [volumeRange, setVolumeRange] = useState<VolumeRange>("daily");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/api/transactions", {
        credentials: "include",
        cache: "no-store",
      });

      const data = (await res.json()) as TransactionsResponse;

      if (!res.ok || data.success === false) {
        setMessage(data.message || "Unable to load dashboard data");
        return;
      }

      const rows = normalizeTransactions(data);
      setTransactions(rows);
    } catch {
      setMessage("Unable to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial dashboard hydration intentionally uses the same fetch path as Refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, []);

  const summary = summarizeTransactions(transactions);

  const volumeRows = useMemo(() => {
    const rows = emptyBuckets(volumeRange);
    const rowMap = new Map(rows.map((row) => [row.key, row]));

    transactions.forEach((txn) => {
      const date = new Date(txn.createdAt || txn.updatedAt || "");
      if (Number.isNaN(date.getTime())) return;

      const bucket = bucketFor(date, volumeRange);
      const row = rowMap.get(bucket.key);
      if (!row) return;

      const amount = amountOf(txn);
      row.volume += amount;
      if (isSuccess(txn.status)) row.success += amount;
      if (isFailed(txn.status)) row.failed += amount;
    });

    return rows;
  }, [transactions, volumeRange]);

  const latestTransactions = useMemo(() => {
    return [...transactions]
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.updatedAt || 0).getTime() -
          new Date(a.createdAt || a.updatedAt || 0).getTime()
      )
      .slice(0, 8);
  }, [transactions]);

  return (
    <main>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">
              Wpay Admin
            </p>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">Operations overview</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              Track total volume, success quality, failed amount, and live payment activity across merchants.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href="/admin/finance" className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-black hover:bg-gray-50">
              Finance
            </a>
            <a href="/admin/finance/settlements" className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-black hover:bg-gray-50">
              USDT Transfers
            </a>
            <button onClick={loadDashboard} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black">
              Refresh
            </button>
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Total Volume" value={formatMoney(summary.totalVolume)} note="All created payment amount" />
          <Metric label="Success Amount" value={formatMoney(summary.successAmount)} note={`${summary.successful} successful`} tone="success" />
          <Metric label="Failed Amount" value={formatMoney(summary.failedAmount)} note={`${summary.failed} failed`} tone="danger" />
          <Metric label="Success Rate" value={`${summary.successRate.toFixed(1)}%`} note={`${summary.successful}/${summary.totalTransactions} transactions`} />
          <Metric label="Active Merchants" value={String(summary.activeMerchants)} note="Seen in transaction data" />
        </section>

        <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-2xl font-black">Total volume analytics</h2>
              <p className="mt-1 text-sm text-gray-600">
                One line view across hourly, daily, weekly, monthly, and yearly buckets.
              </p>
            </div>

            <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50/70 p-1">
              {volumeRanges.map((range) => (
                <button
                  key={range.key}
                  onClick={() => setVolumeRange(range.key)}
                  className={`rounded-lg px-3 py-2 text-xs font-black ${
                    volumeRange === range.key
                      ? "bg-blue-600 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-8 text-center text-gray-600">
              Loading total volume...
            </div>
          ) : (
            <div className="h-[330px] rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeRows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminTotalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d8b76a" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#d8b76a" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="adminSuccessGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="adminFailedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#020617",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "14px",
                      color: "#fff",
                    }}
                    formatter={(value, name) => [
                      formatMoney(Number(value)),
                      name === "volume"
                        ? "Total Volume"
                        : name === "success"
                          ? "Success Amount"
                          : "Failed Amount",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    name="volume"
                    stroke="#d8b76a"
                    fill="url(#adminTotalGradient)"
                    strokeWidth={3}
                    activeDot={{ r: 7 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="success"
                    name="success"
                    stroke="#22c55e"
                    fill="url(#adminSuccessGradient)"
                    strokeWidth={3}
                    activeDot={{ r: 7 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    name="failed"
                    stroke="#ef4444"
                    fill="url(#adminFailedGradient)"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Recent transactions</h2>
              <p className="mt-1 text-xs text-gray-600">Latest payment attempts across all merchants.</p>
            </div>
            <a href="/admin/transactions" className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-black hover:bg-gray-50">
              View all
            </a>
          </div>

          {loading ? (
            <div className="p-8 text-gray-700">Loading transactions...</div>
          ) : latestTransactions.length === 0 ? (
            <div className="p-8 text-gray-700">No recent transactions found.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-4 py-4">Time</th>
                    <th className="px-4 py-4">Transaction</th>
                    <th className="px-4 py-4">Merchant</th>
                    <th className="px-4 py-4">Gateway</th>
                    <th className="px-4 py-4 text-right">Amount</th>
                    <th className="px-4 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTransactions.map((txn, index) => {
                    const id =
                      txn.transactionId ||
                      txn.merchantRefId ||
                      txn.gatewayTransactionId ||
                      txn.providerOrderId ||
                      txn._id ||
                      `TXN-${index + 1}`;

                    return (
                      <tr key={`${id}-${index}`} className="border-t border-gray-200 hover:bg-white">
                        <td className="px-4 py-4 text-gray-700">
                          {formatTxnDate(txn.createdAt || txn.updatedAt)}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-mono text-xs font-black text-gray-900">{id}</p>
                        </td>
                        <td className="px-4 py-4 text-gray-700">{txn.merchantEmail || "-"}</td>
                        <td className="px-4 py-4 text-gray-700">{txn.gateway || "-"}</td>
                        <td className="px-4 py-4 text-right font-black">
                          {formatMoney(amountOf(txn))}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-black ${statusBadge(txn.status)}`}>
                            {txn.status || "pending"}
                          </span>
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

function Metric({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-600">
        {label}
      </p>
      <p
        className={`mt-3 break-words text-2xl font-black leading-tight ${
          tone === "success"
            ? "text-emerald-600"
            : tone === "danger"
            ? "text-red-600"
            : "text-gray-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-gray-600">{note}</p>
    </div>
  );
}

