"use client";

import { useEffect, useMemo, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;

function money(value: unknown) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function percent(value: unknown) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}%`;
}

export default function AdminFinancePage() {
  const [loading, setLoading] = useState(true);
  const [profitReport, setProfitReport] = useState<AnyRecord | null>(null);
  const [payableBalances, setPayableBalances] = useState<AnyRecord[]>([]);
  const [payouts, setPayouts] = useState<AnyRecord[]>([]);
  const [usdtSettlements, setUsdtSettlements] = useState<AnyRecord[]>([]);
  const [settings, setSettings] = useState<AnyRecord | null>(null);
  const [error, setError] = useState("");

  async function loadFinance() {
    try {
      setLoading(true);
      setError("");

      const [
        profitRes,
        payableRes,
        payoutsRes,
        usdtRes,
        settingsRes,
      ] = await Promise.all([
        fetch("/api/admin/finance/profit-report", { credentials: "include" }),
        fetch("/api/admin/payable-balances", { credentials: "include" }),
        fetch("/api/admin/finance/payouts", { credentials: "include" }),
        fetch("/api/admin/finance/usdt-settlements", { credentials: "include" }),
        fetch("/api/admin/finance/settings", { credentials: "include" }),
      ]);

      const [profitData, payableData, payoutsData, usdtData, settingsData] =
        await Promise.all([
          profitRes.json(),
          payableRes.json(),
          payoutsRes.json(),
          usdtRes.json(),
          settingsRes.json(),
        ]);

      if (!profitData.success) throw new Error(profitData.message || "Profit report failed");
      if (!payableData.success) throw new Error(payableData.message || "Payable balance failed");
      if (!payoutsData.success) throw new Error(payoutsData.message || "Payouts failed");
      if (!usdtData.success) throw new Error(usdtData.message || "USDT settlements failed");
      if (!settingsData.success) throw new Error(settingsData.message || "Finance settings failed");

      setProfitReport(profitData);
      setPayableBalances(payableData.balances || []);
      setPayouts(payoutsData.payouts || []);
      setUsdtSettlements(usdtData.settlements || []);
      setSettings(settingsData.settings || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadFinance();
    });
  }, []);

  const totals = profitReport?.totals || {};

  const negativeBalances = useMemo(() => {
    return payableBalances.filter((item) => Number(item.payableBalance || 0) < 0);
  }, [payableBalances]);

  return (
    <main>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-600">Admin Finance</p>
            <h1 className="text-3xl font-bold">Wpay Finance Dashboard</h1>
            <p className="mt-2 text-sm text-gray-600">
              Payin profit, payout profit, USDT settlements and merchant payable balances.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/finance/payouts"
              className="rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold hover:bg-slate-700"
            >
              Payout Queue
            </a>
            <a
              href="/admin/finance/pricing"
              className="rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold hover:bg-slate-700"
            >
              Pricing Settings
            </a>
            <a
              href="/admin/finance/settlements"
              className="rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold hover:bg-slate-700"
            >
              USDT Transfers
            </a>
            <button
              onClick={loadFinance}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
            Loading finance data...
          </div>
        ) : (
          <>
            <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card title="Payin Volume" value={money(totals.payinVolume)} />
              <Card title="Payin Profit" value={money(totals.payinGrossProfit)} />
              <Card title="Payout Profit" value={money(totals.payoutGrossProfit)} />
              <Card title="Total Gross Profit" value={money(totals.totalGrossProfit)} />
              <Card title="Payin Fee Collected" value={money(totals.payinFeeCollected)} />
              <Card title="Total Payin Cost" value={money(totals.totalPayinCost)} />
              <Card title="Payout Paid" value={money(totals.payoutPaidAmount)} />
              <Card title="USDT INR Settled" value={money(totals.usdtConfirmedInrAmount)} />
            </section>

            {settings ? (
              <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="mb-4 text-xl font-bold">Default Finance Settings</h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Mini label="Payin Sell" value={percent(settings.payinSellingFeePercent)} />
                  <Mini label="Gateway Official" value={percent(settings.payinOfficialFeePercent)} />
                  <Mini label="Additional Cost" value={percent(settings.payinAdditionalCostPercent)} />
                  <Mini label="MID Cost" value={percent(settings.midProviderCostPercent)} />
                  <Mini label="Payout Sell" value={percent(settings.payoutSellingFeePercent)} />
                  <Mini label="Payout Cost" value={percent(settings.payoutProviderCostPercent)} />
                  <Mini label="USDT Rate" value={money(settings.usdtRateInr)} />
                  <Mini label="USDT Network" value={settings.usdtNetwork || "TRC20"} />
                </div>
              </section>
            ) : null}

            {negativeBalances.length > 0 ? (
              <section className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-50 p-5">
                <h2 className="text-lg font-bold text-amber-700">Negative Balance Alert</h2>
                <p className="mt-2 text-sm text-amber-100">
                  {negativeBalances.length} merchant(s) have negative payable balance. This usually means payout/USDT/settlement is higher than available payin balance.
                </p>
              </section>
            ) : null}

            <TableSection title="Merchant Profit Report">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="text-gray-600">
                  <tr>
                    <Th>Merchant</Th>
                    <Th>Payin Volume</Th>
                    <Th>Payin Profit</Th>
                    <Th>Payout Paid</Th>
                    <Th>Payout Profit</Th>
                    <Th>USDT INR</Th>
                    <Th>Total Profit</Th>
                    <Th>Payable</Th>
                  </tr>
                </thead>
                <tbody>
                  {(profitReport?.reports || []).map((item: AnyRecord) => (
                    <tr key={item.merchantEmail} className="border-t border-gray-200">
                      <Td>{item.merchantEmail}</Td>
                      <Td>{money(item.payin?.volume)}</Td>
                      <Td className="text-emerald-600">{money(item.payin?.grossProfit)}</Td>
                      <Td>{money(item.payout?.paidAmount)}</Td>
                      <Td className="text-emerald-600">{money(item.payout?.grossProfit)}</Td>
                      <Td>{money(item.usdt?.confirmedInrAmount)}</Td>
                      <Td className="font-semibold text-emerald-600">{money(item.totalGrossProfit)}</Td>
                      <Td className={Number(item.merchantPayableBeforePayoutUsdt || 0) < 0 ? "text-red-600" : "text-emerald-600"}>
                        {money(item.merchantPayableBeforePayoutUsdt)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableSection>

            <TableSection title="Payable Balances">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="text-gray-600">
                  <tr>
                    <Th>Merchant</Th>
                    <Th>Success Volume</Th>
                    <Th>Payin Fee</Th>
                    <Th>Chargeback</Th>
                    <Th>Payout Paid</Th>
                    <Th>USDT Confirmed</Th>
                    <Th>Settlement Paid</Th>
                    <Th>Final Payable</Th>
                  </tr>
                </thead>
                <tbody>
                  {payableBalances.map((item) => (
                    <tr key={item.merchantEmail} className="border-t border-gray-200">
                      <Td>{item.merchantEmail}</Td>
                      <Td>{money(item.successfulVolume)}</Td>
                      <Td>{money(item.payinFeeAmount)}</Td>
                      <Td>{money(item.chargebackAmount)}</Td>
                      <Td>{money(item.paidPayoutAmount)}</Td>
                      <Td>{money(item.confirmedUsdtInrAmount)}</Td>
                      <Td>{money(item.paidSettlementAmount)}</Td>
                      <Td className={Number(item.payableBalance || 0) < 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                        {money(item.payableBalance)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableSection>

            <TableSection title="Payouts">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-gray-600">
                  <tr>
                    <Th>Payout ID</Th>
                    <Th>Merchant</Th>
                    <Th>Amount</Th>
                    <Th>Fee</Th>
                    <Th>Cost</Th>
                    <Th>Profit</Th>
                    <Th>Status</Th>
                    <Th>UTR</Th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((item) => (
                    <tr key={item.payoutId} className="border-t border-gray-200">
                      <Td>{item.payoutId}</Td>
                      <Td>{item.merchantEmail}</Td>
                      <Td>{money(item.amount)}</Td>
                      <Td>{money(item.merchantFeeAmount)}</Td>
                      <Td>{money(item.providerCostAmount)}</Td>
                      <Td className="text-emerald-600">{money(item.grossProfitAmount)}</Td>
                      <Td><Status value={item.status} /></Td>
                      <Td>{item.utr || "-"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableSection>

            <TableSection title="USDT Settlements">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-gray-600">
                  <tr>
                    <Th>USDT ID</Th>
                    <Th>Merchant</Th>
                    <Th>INR Amount</Th>
                    <Th>USDT Rate</Th>
                    <Th>USDT Amount</Th>
                    <Th>Network</Th>
                    <Th>Status</Th>
                    <Th>TX Hash</Th>
                  </tr>
                </thead>
                <tbody>
                  {usdtSettlements.map((item) => (
                    <tr key={item.usdtSettlementId} className="border-t border-gray-200">
                      <Td>{item.usdtSettlementId}</Td>
                      <Td>{item.merchantEmail}</Td>
                      <Td>{money(item.inrAmount)}</Td>
                      <Td>{money(item.usdtRateInr)}</Td>
                      <Td>{Number(item.usdtAmount || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</Td>
                      <Td>{item.network}</Td>
                      <Td><Status value={item.status} /></Td>
                      <Td>{item.txHash || "-"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableSection>
          </>
        )}
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-600">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function TableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-3 font-medium">{children}</th>;
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`whitespace-nowrap px-3 py-3 ${className}`}>{children}</td>;
}

function Status({ value }: { value: string }) {
  const normalized = String(value || "").toLowerCase();

  const color =
    normalized === "paid" || normalized === "confirmed"
      ? "bg-emerald-50 text-emerald-600 border-emerald-500/30"
      : normalized === "failed" || normalized === "cancelled"
      ? "bg-red-50 text-red-600 border-red-500/30"
      : "bg-amber-50 text-amber-600 border-amber-500/30";

  return (
    <span className={`rounded-full border px-2 py-1 text-xs ${color}`}>
      {value || "-"}
    </span>
  );
}

