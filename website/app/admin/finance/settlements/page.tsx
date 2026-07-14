"use client";

import { useEffect, useMemo, useState } from "react";

type AnyRecord = Record<string, any>;

function money(value: unknown) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export default function FinanceSettlementsPage() {
  const [usdtSettlements, setUsdtSettlements] = useState<AnyRecord[]>([]);
  const [payableBalances, setPayableBalances] = useState<AnyRecord[]>([]);
  const [merchants, setMerchants] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [usdtForm, setUsdtForm] = useState({
    merchantEmail: "",
    inrAmount: "",
    usdtRateInr: "88",
    network: "TRC20",
    walletAddress: "",
    note: "",
  });

  async function loadData() {
    try {
      setLoading(true);
      const [usdtRes, payableRes, merchantsRes, settingsRes] = await Promise.all([
        fetch("/api/admin/finance/usdt-settlements", { credentials: "include" }),
        fetch("/api/admin/payable-balances", { credentials: "include" }),
        fetch("/api/merchants", { credentials: "include" }),
        fetch("/api/admin/finance/settings", { credentials: "include" }),
      ]);

      const [usdtData, payableData, merchantsData, settingsData] = await Promise.all([
        usdtRes.json(),
        payableRes.json(),
        merchantsRes.json(),
        settingsRes.json(),
      ]);

      if (!usdtData.success) throw new Error(usdtData.message || "USDT failed");
      if (!payableData.success) throw new Error(payableData.message || "Payable balances failed");
      if (!merchantsData.success) throw new Error(merchantsData.message || "Merchants failed");
      if (!settingsData.success) throw new Error(settingsData.message || "Finance settings failed");

      setUsdtSettlements(usdtData.settlements || []);
      setPayableBalances(payableData.balances || []);
      setMerchants(merchantsData.merchants || []);
      setUsdtForm((current) => ({
        ...current,
        usdtRateInr: current.usdtRateInr || String(settingsData.settings?.usdtRateInr || 88),
        network: current.network || String(settingsData.settings?.usdtNetwork || "TRC20"),
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load settlements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const merchantOptions = useMemo(() => {
    const merchantMap = new Map<string, AnyRecord>();

    merchants.forEach((merchant) => {
      const email = String(merchant.email || merchant.merchantEmail || "").trim().toLowerCase();
      if (!email) return;
      merchantMap.set(email, {
        email,
        label: merchant.businessName || merchant.name || merchant.ownerName || email,
      });
    });

    payableBalances.forEach((balance) => {
      const email = String(balance.merchantEmail || "").trim().toLowerCase();
      if (!email || merchantMap.has(email)) return;
      merchantMap.set(email, { email, label: email });
    });

    return Array.from(merchantMap.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label))
    );
  }, [merchants, payableBalances]);

  const selectedBalance = useMemo(() => {
    return payableBalances.find(
      (item) =>
        String(item.merchantEmail || "").toLowerCase() ===
        usdtForm.merchantEmail.toLowerCase()
    );
  }, [payableBalances, usdtForm.merchantEmail]);

  async function createUsdtSettlement() {
    try {
      setMessage("");

      const response = await fetch("/api/admin/finance/usdt-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...usdtForm,
          inrAmount: Number(usdtForm.inrAmount || 0),
          usdtRateInr: Number(usdtForm.usdtRateInr || 0),
        }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Failed to send USDT");

      setMessage("USDT transfer created successfully.");
      setUsdtForm({
        merchantEmail: "",
        inrAmount: "",
        usdtRateInr: "88",
        network: "TRC20",
        walletAddress: "",
        note: "",
      });
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send USDT");
    }
  }

  async function updateUsdtStatus(usdtSettlementId: string, status: string) {
    try {
      const txHash =
        status === "confirmed" || status === "sent"
          ? window.prompt("Enter TX hash", "") || ""
          : "";

      const note = window.prompt("Note", `${status} by admin`) || "";

      const response = await fetch(
        `/api/admin/finance/usdt-settlements/${usdtSettlementId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status, txHash, note }),
        }
      );

      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Failed to update USDT transfer");

      setMessage(`USDT transfer marked ${status}.`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update USDT transfer");
    }
  }

  return (
    <main>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-600">Admin Finance</p>
            <h1 className="text-3xl font-bold">USDT Transfers</h1>
            <p className="mt-2 text-sm text-gray-600">
              Select a merchant and transfer payable balance as USDT.
            </p>
          </div>

          <div className="flex gap-3">
            <a href="/admin/finance" className="rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold hover:bg-slate-700">
              Finance Dashboard
            </a>
            <button onClick={loadData} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-700">
              Refresh
            </button>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-50 p-4 text-blue-100">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
            Loading...
          </div>
        ) : (
          <>
            <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h2 className="mb-5 text-xl font-bold">Send USDT</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Select
                    label="Merchant"
                    value={usdtForm.merchantEmail}
                    onChange={(v) => setUsdtForm((c) => ({ ...c, merchantEmail: v }))}
                    options={merchantOptions.map((merchant) => ({
                      value: merchant.email,
                      label: `${merchant.label} - ${merchant.email}`,
                    }))}
                  />
                  <Input label="Payable Amount" value={usdtForm.inrAmount} onChange={(v) => setUsdtForm((c) => ({ ...c, inrAmount: v }))} />
                  <Input label="USDT Rate" value={usdtForm.usdtRateInr} onChange={(v) => setUsdtForm((c) => ({ ...c, usdtRateInr: v }))} />
                  <Input label="Network" value={usdtForm.network} onChange={(v) => setUsdtForm((c) => ({ ...c, network: v }))} />
                </div>
                <Input label="Wallet Address" value={usdtForm.walletAddress} onChange={(v) => setUsdtForm((c) => ({ ...c, walletAddress: v }))} />
                <Input label="Note" value={usdtForm.note} onChange={(v) => setUsdtForm((c) => ({ ...c, note: v }))} />
                <button onClick={createUsdtSettlement} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold hover:bg-emerald-700">
                  Send USDT
                </button>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h2 className="mb-5 text-xl font-bold">Selected Merchant</h2>
                {selectedBalance ? (
                  <div className="grid gap-4">
                    <Mini label="Final Payable" value={money(selectedBalance.payableBalance)} />
                    <Mini label="Success Volume" value={money(selectedBalance.successfulVolume)} />
                    <Mini label="Pending USDT" value={money(selectedBalance.pendingUsdtInrAmount)} />
                    <Mini label="Confirmed USDT" value={money(selectedBalance.confirmedUsdtInrAmount)} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    Select a merchant to view payable balance before sending USDT.
                  </p>
                )}
              </div>
            </section>

            <TableSection title="USDT Transfer History">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="text-gray-600">
                  <tr>
                    <Th>USDT ID</Th>
                    <Th>Merchant</Th>
                    <Th>Payable</Th>
                    <Th>Rate</Th>
                    <Th>USDT</Th>
                    <Th>Network</Th>
                    <Th>Status</Th>
                    <Th>TX Hash</Th>
                    <Th>Action</Th>
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
                      <Td>
                        <div className="flex gap-2">
                          <Action label="Sent" onClick={() => updateUsdtStatus(item.usdtSettlementId, "sent")} />
                          <Action label="Confirm" onClick={() => updateUsdtStatus(item.usdtSettlementId, "confirmed")} />
                          <Action label="Failed" onClick={() => updateUsdtStatus(item.usdtSettlementId, "failed")} danger />
                        </div>
                      </Td>
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

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
      >
        <option value="">Select merchant</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

function TableSection({ title, children }: { title: string; children: React.ReactNode }) {
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

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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

function Action({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
        danger
          ? "bg-red-600 hover:bg-red-700"
          : "bg-gray-100 hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

