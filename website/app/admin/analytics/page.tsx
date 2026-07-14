"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DonutChart,
  HorizontalBarChart,
  VolumeLineChart,
} from "@/components/admin/AdminCharts";

type AnyRecord = Record<string, any>;

function money(value: unknown) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function isSuccess(status?: string) {
  return ["paid", "success", "successful", "completed", "captured"].includes(
    String(status || "").toLowerCase()
  );
}

function isFailed(status?: string) {
  return ["failed", "failure", "cancelled", "canceled", "rejected", "declined"].includes(
    String(status || "").toLowerCase()
  );
}

function normalizeList(data: AnyRecord, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function topRows(rows: AnyRecord[], key: string, amountKey = "amount") {
  const map = new Map<string, { label: string; amount: number; count: number }>();

  rows.forEach((row) => {
    const label = String(row[key] || "Unassigned");
    const current = map.get(label) || { label, amount: 0, count: 0 };
    current.amount += Number(row[amountKey] || 0);
    current.count += 1;
    map.set(label, current);
  });

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
}

function bucketForDay(value?: string) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return null;

  return {
    key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    label: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
  };
}

function emptyDailyBuckets() {
  const now = new Date();

  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (13 - index));
    const bucket = bucketForDay(date.toISOString());

    return {
      key: bucket?.key || String(index),
      label: bucket?.label || "-",
      value: 0,
      count: 0,
    };
  });
}

export default function AdminAnalyticsPage() {
  const [transactions, setTransactions] = useState<AnyRecord[]>([]);
  const [merchants, setMerchants] = useState<AnyRecord[]>([]);
  const [balances, setBalances] = useState<AnyRecord[]>([]);
  const [usdtSettlements, setUsdtSettlements] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadAnalytics() {
    try {
      setLoading(true);
      setMessage("");

      const [transactionRes, merchantRes, balanceRes, usdtRes] = await Promise.all([
        fetch("/api/transactions", { cache: "no-store", credentials: "include" }),
        fetch("/api/merchants", { cache: "no-store", credentials: "include" }),
        fetch("/api/admin/payable-balances", { cache: "no-store", credentials: "include" }),
        fetch("/api/admin/finance/usdt-settlements", { cache: "no-store", credentials: "include" }),
      ]);

      const [transactionData, merchantData, balanceData, usdtData] = await Promise.all([
        transactionRes.json(),
        merchantRes.json(),
        balanceRes.json(),
        usdtRes.json(),
      ]);

      if (!transactionRes.ok || transactionData.success === false) {
        throw new Error(transactionData.message || "Transactions failed");
      }

      setTransactions(normalizeList(transactionData, ["transactions"]));
      setMerchants(normalizeList(merchantData, ["merchants"]));
      setBalances(normalizeList(balanceData, ["balances"]));
      setUsdtSettlements(normalizeList(usdtData, ["settlements"]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const analytics = useMemo(() => {
    const successful = transactions.filter((item) => isSuccess(item.status));
    const failed = transactions.filter((item) => isFailed(item.status));
    const pending = transactions.filter(
      (item) => !isSuccess(item.status) && !isFailed(item.status)
    );

    const successVolume = successful.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const failedVolume = failed.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingVolume = pending.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalVolume = transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const successRate = transactions.length ? (successful.length / transactions.length) * 100 : 0;
    const failureRate = transactions.length ? (failed.length / transactions.length) * 100 : 0;
    const payable = balances.reduce((sum, item) => sum + Number(item.payableBalance || 0), 0);
    const usdtPending = usdtSettlements
      .filter((item) => ["pending", "sent"].includes(String(item.status || "")))
      .reduce((sum, item) => sum + Number(item.inrAmount || 0), 0);

    return {
      successful,
      failed,
      pending,
      totalVolume,
      successVolume,
      failedVolume,
      pendingVolume,
      successRate,
      failureRate,
      payable,
      usdtPending,
      activeMerchants: merchants.filter((item) => item.status === "active").length,
      blockedMerchants: merchants.filter((item) => item.status === "blocked").length,
      topMerchants: topRows(successful, "merchantEmail"),
      topGateways: topRows(transactions, "gateway"),
      statusRows: [
        { label: "Success", count: successful.length, amount: successVolume, color: "var(--gp-success)" },
        { label: "Failed", count: failed.length, amount: failedVolume, color: "var(--gp-danger)" },
        { label: "Pending", count: pending.length, amount: pendingVolume, color: "var(--gp-warning)" },
      ],
    };
  }, [transactions, merchants, balances, usdtSettlements]);

  const trendPoints = useMemo(() => {
    const rows = emptyDailyBuckets();
    const rowMap = new Map(rows.map((row) => [row.key, row]));

    transactions.forEach((txn) => {
      const bucket = bucketForDay(txn.createdAt || txn.updatedAt);
      if (!bucket) return;

      const row = rowMap.get(bucket.key);
      if (!row) return;

      row.value += Number(txn.amount || 0);
      row.count += 1;
    });

    return rows.map((row) => ({
      label: row.label,
      value: row.value,
      detail: `${row.count} attempts`,
    }));
  }, [transactions]);

  const statusDonutRows = analytics.statusRows.map((row) => ({
    label: row.label,
    value: row.count,
    color: row.color,
    detail: `${row.count} payments | ${money(row.amount)}`,
  }));

  const merchantRows = (analytics.topMerchants.length
    ? analytics.topMerchants
    : [{ label: "No merchant volume yet", amount: 0, count: 0 }]
  ).map((row) => ({
    label: row.label,
    value: row.amount,
    detail: `${row.count} successful payments`,
  }));

  const gatewayRows = (analytics.topGateways.length
    ? analytics.topGateways
    : [{ label: "No gateway traffic yet", amount: 0, count: 0 }]
  ).map((row) => ({
    label: row.label,
    value: row.amount,
    detail: `${row.count} attempts`,
  }));

  return (
    <main>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">
              Wpay Analytics
            </p>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">Platform intelligence</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              A complete view of merchant activity, payment quality, gateway usage, payable balances, and USDT movement.
            </p>
          </div>

          <button onClick={loadAnalytics} className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-sm font-black">
            Refresh
          </button>
        </div>

        {message ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Metric label="Total volume" value={money(analytics.totalVolume)} note={`${transactions.length} attempts`} />
          <Metric label="Success volume" value={money(analytics.successVolume)} note={`${analytics.successRate.toFixed(1)}% success`} tone="success" />
          <Metric label="Failed volume" value={money(analytics.failedVolume)} note={`${analytics.failureRate.toFixed(1)}% failed`} tone="danger" />
          <Metric label="Payable balance" value={money(analytics.payable)} note="Across merchants" />
          <Metric label="USDT pending" value={money(analytics.usdtPending)} note={`${usdtSettlements.length} transfers`} />
          <Metric label="Active merchants" value={String(analytics.activeMerchants)} note={`${analytics.blockedMerchants} blocked`} />
        </section>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-8 text-gray-600">
            Loading analytics...
          </div>
        ) : (
          <div className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl xl:col-span-2">
              <div className="mb-5">
                <h2 className="text-2xl font-black">Volume trend</h2>
                <p className="mt-1 text-sm text-gray-600">Daily attempted volume across the last 14 days.</p>
              </div>

              <VolumeLineChart points={trendPoints} />
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
              <div className="mb-5">
                <h2 className="text-2xl font-black">Payment quality mix</h2>
                <p className="mt-1 text-sm text-gray-600">Outcome share by transaction count with amount details.</p>
              </div>

              <DonutChart
                rows={statusDonutRows}
                centerLabel="total attempts"
                centerValue={String(transactions.length)}
              />
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
              <div className="mb-5">
                <h2 className="text-2xl font-black">Top merchants by successful volume</h2>
                <p className="mt-1 text-sm text-gray-600">The merchants currently driving collection volume.</p>
              </div>

              <HorizontalBarChart rows={merchantRows} />
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl xl:col-span-2">
              <div className="mb-5">
                <h2 className="text-2xl font-black">Gateway distribution</h2>
                <p className="mt-1 text-sm text-gray-600">Attempted volume grouped by gateway name.</p>
              </div>

              <div className={`grid gap-5 ${gatewayRows.length > 3 ? "md:grid-cols-2" : ""}`}>
                <HorizontalBarChart rows={gatewayRows.slice(0, 3)} />
                {gatewayRows.length > 3 ? <HorizontalBarChart rows={gatewayRows.slice(3)} /> : null}
              </div>
            </section>
          </div>
        )}
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
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-600">{label}</p>
      <p
        className={`mt-3 break-words text-2xl font-black ${
          tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-gray-600">{note}</p>
    </div>
  );
}

