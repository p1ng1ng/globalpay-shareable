"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  BellRing,
  KeyRound,
  Link2,
  RefreshCcw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getLoggedInMerchantEmail } from "@/lib/getMerchantEmailClient";
import { authHeaders } from "@/lib/clientAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { translate } from "@/lib/i18n";

type PaymentLink = {
  _id: string;
  linkId: string;
  merchantEmail: string;
  title: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
};

type Transaction = {
  _id: string;
  transactionId: string;
  paymentLinkId: string;
  merchantEmail: string;
  customerName: string;
  customerEmail: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string;
  createdAt?: string;
};

type HourlyPaymentRow = {
  hour: number;
  label: string;
  successVolume: number;
  failedVolume: number;
  successCount: number;
  failedCount: number;
};

type MerchantMetrics = {
  merchantEmail: string;
  totalTransactions: number;
  successCount: number;
  failedCount: number;
  refundedCount: number;
  successRate: number;
  totalVolume: number;
  failedVolume: number;
  refundedVolume: number;
  chargebackCount: number;
  chargebackAmount: number;
  currency: string;
};

const emptyHourlyRows: HourlyPaymentRow[] = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  label: `${String(hour).padStart(2, "0")}:00`,
  successVolume: 0,
  failedVolume: 0,
  successCount: 0,
  failedCount: 0,
}));

function money(amount: number) {
  return `INR ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function shortDate(dateValue?: string) {
  if (!dateValue) return "-";
  return new Date(dateValue).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function shortMonth(date: Date) {
  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
  });
}

function normalizeStatus(status?: string) {
  return String(status || "").toLowerCase().trim();
}

function isSuccess(status?: string) {
  const value = normalizeStatus(status);
  return ["success", "paid", "completed", "captured"].includes(value);
}

function isFailed(status?: string) {
  const value = normalizeStatus(status);
  return ["failed", "failure", "expired", "cancelled", "canceled", "declined"].includes(value);
}

function isRefunded(status?: string) {
  const value = normalizeStatus(status);
  return ["refunded", "refund"].includes(value);
}

function isPending(status?: string) {
  const value = normalizeStatus(status);
  return !isSuccess(value) && !isFailed(value) && !isRefunded(value);
}

function statusBadge(status: string) {
  if (isSuccess(status)) return "bg-emerald-500/20 text-emerald-300";
  if (isFailed(status)) return "bg-red-500/20 text-red-300";
  if (isRefunded(status)) return "bg-amber-500/20 text-amber-300";
  return "bg-blue-500/20 text-blue-300";
}

function MetricCard({
  title,
  value,
  subValue,
  note,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subValue?: string;
  note?: string;
  icon: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5 shadow-2xl shadow-black/20">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${tone}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-300">{title}</p>
          <p className="mt-3 break-words text-2xl font-black">{value}</p>
          {subValue ? <p className="mt-3 text-sm font-bold text-emerald-300">{subValue}</p> : null}
          {note ? <p className="text-xs text-slate-400">{note}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function MerchantDashboardPage() {
  const [merchantEmail, setMerchantEmail] = useState("");
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hourlyRows, setHourlyRows] = useState<HourlyPaymentRow[]>(emptyHourlyRows);
  const [metrics, setMetrics] = useState<MerchantMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const { language } = useLanguage();

  async function loadDashboard(email: string) {
    try {
      setLoading(true);
      setMessage("");

      const [linksResponse, transactionsResponse, analyticsResponse, metricsResponse] =
        await Promise.all([
          fetch(`/api/payment-links?merchantEmail=${encodeURIComponent(email)}`, {
            cache: "no-store",
          }),
          fetch(`/api/transactions?merchantEmail=${encodeURIComponent(email)}`, {
            cache: "no-store",
          }),
          fetch("/api/merchant/analytics/hourly", {
            cache: "no-store",
            credentials: "include",
            headers: authHeaders(),
          }),
          fetch("/api/merchant/metrics", {
            cache: "no-store",
            credentials: "include",
            headers: authHeaders(),
          }),
        ]);

      const linksData = await linksResponse.json();
      const transactionsData = await transactionsResponse.json();
      const analyticsData = await analyticsResponse.json();
      const metricsData = await metricsResponse.json();

      if (linksData.success) setPaymentLinks(linksData.paymentLinks || []);
      if (transactionsData.success) setTransactions(transactionsData.transactions || []);
      if (analyticsData.success) setHourlyRows(analyticsData.rows || emptyHourlyRows);
      if (metricsData.success) setMetrics(metricsData.metrics || null);
    } catch {
      setMessage("Failed to load merchant dashboard.");
    } finally {
      setLoading(false);
    }
  }

  async function initializeDashboard() {
    try {
      const email = await getLoggedInMerchantEmail();
      setMerchantEmail(email);
      await loadDashboard(email);
    } catch {
      setMessage("Please login again as merchant.");
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void initializeDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
    // initializeDashboard performs the initial merchant session lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const stats = useMemo(() => {
    const success = transactions.filter((trx) => isSuccess(trx.status));
    const failed = transactions.filter((trx) => isFailed(trx.status));
    const refunded = transactions.filter((trx) => isRefunded(trx.status));
    const pending = transactions.filter((trx) => isPending(trx.status));

    const successAmount = success.reduce((sum, trx) => sum + Number(trx.amount || 0), 0);
    const failedAmount = failed.reduce((sum, trx) => sum + Number(trx.amount || 0), 0);
    const refundedAmount = refunded.reduce((sum, trx) => sum + Number(trx.amount || 0), 0);
    const pendingAmount = pending.reduce((sum, trx) => sum + Number(trx.amount || 0), 0);
    const failedMetricCount = Number(metrics?.failedCount ?? failed.length);
    const failedMetricAmount = Number(metrics?.failedVolume ?? failedAmount);

    const totalCreatedVolume = transactions.reduce((sum, trx) => sum + Number(trx.amount || 0), 0);
    const totalAmount = totalCreatedVolume || metrics?.totalVolume || successAmount;
    const payableBalance = Math.max(0, successAmount - refundedAmount);

    const successRate =
      metrics?.successRate ??
      (transactions.length > 0 ? Math.round((success.length / transactions.length) * 100) : 0);

    return {
      success,
      failed,
      refunded,
      pending,
      successAmount,
      failedAmount: failedMetricAmount,
      failedCount: failedMetricCount,
      refundedAmount,
      pendingAmount,
      totalAmount,
      payableBalance,
      successRate,
      totalTransactions: metrics?.totalTransactions ?? transactions.length,
      activeLinks: paymentLinks.filter((link) => normalizeStatus(link.status) === "active").length,
      paidLinks: paymentLinks.filter((link) => normalizeStatus(link.status) === "paid").length,
      totalLinks: paymentLinks.length,
      chargebackCount: metrics?.chargebackCount ?? 0,
      chargebackAmount: metrics?.chargebackAmount ?? 0,
    };
  }, [transactions, paymentLinks, metrics]);

  const monthlyRows = useMemo(() => {
    const now = new Date();
    const rows = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        month: shortMonth(date),
        total: 0,
        success: 0,
        pending: 0,
        failed: 0,
      };
    });

    const rowMap = new Map(rows.map((row) => [row.key, row]));

    transactions.forEach((transaction) => {
      const dateValue = transaction.paidAt || transaction.createdAt;
      if (!dateValue) return;

      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const row = rowMap.get(key);
      if (!row) return;

      const amount = Number(transaction.amount || 0);
      row.total += amount;

      if (isSuccess(transaction.status)) row.success += amount;
      else if (isFailed(transaction.status)) row.failed += amount;
      else row.pending += amount;
    });

    return rows;
  }, [transactions]);

  const recentTransactions = transactions.slice(0, 6);

  return (
    <main className="merchant-page min-h-screen bg-[#050917] px-5 py-7 text-white md:px-8">
      <div className="mx-auto max-w-[1500px]">
            <div className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
              <div>
                <h1 className="text-3xl font-black tracking-tight">{t("dashboard")}</h1>
                <p className="mt-2 text-slate-400">
                  Today live data, monthly growth, recent transactions and account tools.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-xl border border-white/10 bg-slate-950/70 px-5 py-3 text-sm font-bold text-slate-200">
                  Today · Live merchant data
                </div>

                <button
                  onClick={() => merchantEmail && loadDashboard(merchantEmail)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-5 py-3 text-sm font-black hover:bg-white/5"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>

                <Link
                  href="/merchant/payment-links"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                >
                  New Payment Link
                </Link>
              </div>
            </div>

            {message ? (
              <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                {message}
              </div>
            ) : null}

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Today Success"
                value={money(stats.successAmount)}
                subValue={`${stats.success.length} successful payments`}
                note="Only successful/paid transactions"
                icon="✓"
                tone="bg-emerald-500 text-white"
              />

              <MetricCard
                title="Today Total"
                value={money(stats.totalAmount)}
                subValue={`${stats.totalTransactions} total transactions`}
                note="Success + pending + failed"
                icon="◉"
                tone="bg-blue-600 text-white"
              />

              <MetricCard
                title="Processing / Pending"
                value={money(stats.pendingAmount)}
                subValue={`${stats.pending.length} pending transactions`}
                note="Not added to payable balance"
                icon="◔"
                tone="bg-amber-500 text-white"
              />

              <MetricCard
                title="Today Failed"
                value={money(stats.failedAmount)}
                subValue={`${stats.failedCount} failed transactions`}
                note="Failed / expired / cancelled"
                icon="×"
                tone="bg-red-500 text-white"
              />
            </section>

            <section className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Available Balance"
                value={money(stats.payableBalance)}
                subValue="Success volume minus refunds"
                note="Usable for payout calculation"
                icon="₹"
                tone="bg-emerald-600 text-white"
              />

              <MetricCard
                title="Success Rate"
                value={`${stats.successRate}%`}
                subValue={`${stats.success.length}/${stats.totalTransactions}`}
                note="Successful / total transactions"
                icon="%"
                tone="bg-indigo-500 text-white"
              />

              <MetricCard
                title="Payment Links"
                value={`${stats.totalLinks}`}
                subValue={`${stats.activeLinks} active / ${stats.paidLinks} paid`}
                note="Manual checkout links"
                icon="↗"
                tone="bg-sky-500 text-white"
              />

              <MetricCard
                title="Chargebacks"
                value={`${stats.chargebackCount}`}
                subValue={money(stats.chargebackAmount)}
                note="Risk and dispute tracking"
                icon="⚠"
                tone="bg-orange-500 text-white"
              />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6">
                <div className="mb-7 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-lg font-black">Transaction Analysis</h2>
                    <p className="mt-1 text-sm text-slate-400">Last 12 months company growth for this merchant.</p>
                  </div>
                  <span className="rounded bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-300">
                    Monthly volume
                  </span>
                </div>

                <div className="h-[330px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyRows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="pendingGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                      <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`} />
                      <Tooltip
                        contentStyle={{
                          background: "#020617",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "14px",
                          color: "#fff",
                        }}
                        formatter={(value) => money(Number(value))}
                      />
                      <Area type="monotone" dataKey="success" name="Success Volume" stroke="#22c55e" fill="url(#successGradient)" strokeWidth={3} />
                      <Area type="monotone" dataKey="pending" name="Pending Volume" stroke="#f59e0b" fill="url(#pendingGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6">
                <div className="mb-7 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black">Today by Hour</h2>
                    <p className="mt-1 text-sm text-slate-400">Successful and failed transaction count.</p>
                  </div>
                  <span className="rounded bg-blue-600/20 px-3 py-1 text-xs font-bold text-blue-300">
                    Live
                  </span>
                </div>

                <div className="h-[330px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                      <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#020617",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "14px",
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="successCount" name="Success" fill="#22c55e" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="failedCount" name="Failed" fill="#ef4444" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-black">{t("recentTransactions")}</h2>
                  <Link href="/merchant/transactions" className="text-sm font-bold text-blue-400">
                    View all
                  </Link>
                </div>

                {loading ? (
                  <p className="py-10 text-slate-400">{t("loadingDashboard")}</p>
                ) : recentTransactions.length === 0 ? (
                  <p className="py-10 text-slate-400">{t("noTransactions")}</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-[#0b1220] text-xs uppercase tracking-[0.16em] text-slate-500">
                        <tr>
                          <th className="px-4 py-4">Date</th>
                          <th className="px-4 py-4">Order / Transaction ID</th>
                          <th className="px-4 py-4">Customer</th>
                          <th className="px-4 py-4 text-right">Amount</th>
                          <th className="px-4 py-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {recentTransactions.map((transaction) => (
                          <tr key={transaction._id} className="hover:bg-white/[0.03]">
                            <td className="px-4 py-4 text-slate-400">
                              {shortDate(transaction.paidAt || transaction.createdAt)}
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-black">{transaction.transactionId || transaction.paymentLinkId}</p>
                              <p className="text-xs text-slate-500">{transaction.paymentLinkId}</p>
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              {transaction.customerName || transaction.customerEmail || "-"}
                            </td>
                            <td className="px-4 py-4 text-right font-black">
                              {transaction.currency || "INR"} {Number(transaction.amount || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-bold ${statusBadge(transaction.status)}`}>
                                {transaction.status || "pending"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-black">Quick Actions</h2>
                  <span className="text-sm font-bold text-slate-400">Merchant tools</span>
                </div>

                <div className="grid gap-3">
                  <Link href="/merchant/payment-links" className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1220] px-4 py-4 font-bold hover:bg-white/5">
                    Create Payment Link <Link2 className="h-5 w-5 text-blue-300" />
                  </Link>
                  <Link href="/merchant/wallet" className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1220] px-4 py-4 font-bold hover:bg-white/5">
                    Wallet & Payout <ArrowDownToLine className="h-5 w-5 text-emerald-300" />
                  </Link>
                  <Link href="/merchant/api-credentials" className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1220] px-4 py-4 font-bold hover:bg-white/5">
                    Developer / API <KeyRound className="h-5 w-5 text-amber-300" />
                  </Link>
                  <Link href="/merchant/webhooks" className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b1220] px-4 py-4 font-bold hover:bg-white/5">
                    Webhook Notifications <BellRing className="h-5 w-5 text-purple-300" />
                  </Link>
                </div>
              </div>
            </section>
      </div>
    </main>
  );
}
