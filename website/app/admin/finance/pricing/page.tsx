"use client";

import { useEffect, useState } from "react";

type FormState = Record<string, string>;

const defaultSettingsForm: FormState = {
  payinOfficialFeePercent: "1",
  payinAdditionalCostPercent: "2.5",
  midProviderCostPercent: "1.2",
  payinSellingFeePercent: "7",
  payoutProviderCostPercent: "1.8",
  payoutSellingFeePercent: "2.8",
  riskReservePercent: "0",
  usdtRateInr: "88",
  usdtNetwork: "TRC20",
};

export default function FinancePricingPage() {
  const [settingsForm, setSettingsForm] =
    useState<FormState>(defaultSettingsForm);

  const [merchantForm, setMerchantForm] = useState({
    merchantEmail: "",
    payinSellingFeePercent: "7",
    payoutSellingFeePercent: "2.8",
    usdtSettlementAllowed: true,
    payoutAllowed: true,
    note: "",
  });

  const [merchantPricing, setMerchantPricing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingMerchant, setSavingMerchant] = useState(false);
  const [message, setMessage] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      setMessage("");

      const [settingsRes, pricingRes] = await Promise.all([
        fetch("/api/admin/finance/settings", { credentials: "include" }),
        fetch("/api/admin/merchant-pricing", { credentials: "include" }),
      ]);

      const [settingsData, pricingData] = await Promise.all([
        settingsRes.json(),
        pricingRes.json(),
      ]);

      if (settingsData.success && settingsData.settings) {
        const s = settingsData.settings;
        setSettingsForm({
          payinOfficialFeePercent: String(s.payinOfficialFeePercent ?? "1"),
          payinAdditionalCostPercent: String(s.payinAdditionalCostPercent ?? "2.5"),
          midProviderCostPercent: String(s.midProviderCostPercent ?? "1.2"),
          payinSellingFeePercent: String(s.payinSellingFeePercent ?? "7"),
          payoutProviderCostPercent: String(s.payoutProviderCostPercent ?? "1.8"),
          payoutSellingFeePercent: String(s.payoutSellingFeePercent ?? "2.8"),
          riskReservePercent: String(s.riskReservePercent ?? "0"),
          usdtRateInr: String(s.usdtRateInr ?? "88"),
          usdtNetwork: String(s.usdtNetwork ?? "TRC20"),
        });
      }

      if (pricingData.success) {
        setMerchantPricing(Array.isArray(pricingData.pricing) ? pricingData.pricing : []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateSettings(key: string, value: string) {
    setSettingsForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    try {
      setSavingSettings(true);
      setMessage("");

      const response = await fetch("/api/admin/finance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settingsForm),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Failed to save settings");
      }

      setMessage("Default finance settings saved successfully.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveMerchantPricing() {
    try {
      setSavingMerchant(true);
      setMessage("");

      const response = await fetch("/api/admin/merchant-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(merchantForm),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Failed to save merchant pricing");
      }

      setMessage("Merchant pricing saved successfully.");
      setMerchantForm({
        merchantEmail: "",
        payinSellingFeePercent: "7",
        payoutSellingFeePercent: "2.8",
        usdtSettlementAllowed: true,
        payoutAllowed: true,
        note: "",
      });
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save merchant pricing");
    } finally {
      setSavingMerchant(false);
    }
  }

  function editMerchant(row: any) {
    setMerchantForm({
      merchantEmail: row.merchantEmail || "",
      payinSellingFeePercent: String(row.payinSellingFeePercent ?? "7"),
      payoutSellingFeePercent: String(row.payoutSellingFeePercent ?? "2.8"),
      usdtSettlementAllowed: Boolean(row.usdtSettlementAllowed ?? true),
      payoutAllowed: Boolean(row.payoutAllowed ?? true),
      note: row.note || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-gray-600">Admin Finance</p>
            <h1 className="text-3xl font-bold">Finance Pricing Settings</h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage default cost rates and merchant-wise selling rates.
            </p>
          </div>

          <a
            href="/admin/finance"
            className="rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold hover:bg-slate-700"
          >
            Back to Finance Dashboard
          </a>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-50 p-4 text-blue-100">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
            Loading pricing settings...
          </div>
        ) : (
          <>
            <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="mb-5 text-xl font-bold">Default Finance Settings</h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input label="Payin Official Fee %" value={settingsForm.payinOfficialFeePercent} onChange={(v) => updateSettings("payinOfficialFeePercent", v)} />
                <Input label="Payin Additional Cost %" value={settingsForm.payinAdditionalCostPercent} onChange={(v) => updateSettings("payinAdditionalCostPercent", v)} />
                <Input label="MID Provider Cost %" value={settingsForm.midProviderCostPercent} onChange={(v) => updateSettings("midProviderCostPercent", v)} />
                <Input label="Default Payin Selling %" value={settingsForm.payinSellingFeePercent} onChange={(v) => updateSettings("payinSellingFeePercent", v)} />
                <Input label="Payout Provider Cost %" value={settingsForm.payoutProviderCostPercent} onChange={(v) => updateSettings("payoutProviderCostPercent", v)} />
                <Input label="Default Payout Selling %" value={settingsForm.payoutSellingFeePercent} onChange={(v) => updateSettings("payoutSellingFeePercent", v)} />
                <Input label="Risk Reserve %" value={settingsForm.riskReservePercent} onChange={(v) => updateSettings("riskReservePercent", v)} />
                <Input label="USDT INR Rate" value={settingsForm.usdtRateInr} onChange={(v) => updateSettings("usdtRateInr", v)} />
                <Input label="USDT Network" value={settingsForm.usdtNetwork} onChange={(v) => updateSettings("usdtNetwork", v)} />
              </div>

              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {savingSettings ? "Saving..." : "Save Default Settings"}
              </button>
            </section>

            <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="mb-5 text-xl font-bold">Merchant Pricing</h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="Merchant Email"
                  value={merchantForm.merchantEmail}
                  onChange={(v) =>
                    setMerchantForm((current) => ({
                      ...current,
                      merchantEmail: v,
                    }))
                  }
                />
                <Input
                  label="Payin Selling %"
                  value={merchantForm.payinSellingFeePercent}
                  onChange={(v) =>
                    setMerchantForm((current) => ({
                      ...current,
                      payinSellingFeePercent: v,
                    }))
                  }
                />
                <Input
                  label="Payout Selling %"
                  value={merchantForm.payoutSellingFeePercent}
                  onChange={(v) =>
                    setMerchantForm((current) => ({
                      ...current,
                      payoutSellingFeePercent: v,
                    }))
                  }
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
                  <input
                    type="checkbox"
                    checked={merchantForm.payoutAllowed}
                    onChange={(event) =>
                      setMerchantForm((current) => ({
                        ...current,
                        payoutAllowed: event.target.checked,
                      }))
                    }
                  />
                  <span>Payout Allowed</span>
                </label>

                <label className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
                  <input
                    type="checkbox"
                    checked={merchantForm.usdtSettlementAllowed}
                    onChange={(event) =>
                      setMerchantForm((current) => ({
                        ...current,
                        usdtSettlementAllowed: event.target.checked,
                      }))
                    }
                  />
                  <span>USDT Settlement Allowed</span>
                </label>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Note</span>
                <textarea
                  value={merchantForm.note}
                  onChange={(event) =>
                    setMerchantForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  className="min-h-24 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                />
              </label>

              <button
                onClick={saveMerchantPricing}
                disabled={savingMerchant}
                className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingMerchant ? "Saving..." : "Save Merchant Pricing"}
              </button>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="mb-5 text-xl font-bold">Saved Merchant Pricing</h2>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="text-gray-600">
                    <tr>
                      <Th>Merchant</Th>
                      <Th>Payin Sell %</Th>
                      <Th>Payout Sell %</Th>
                      <Th>Payout</Th>
                      <Th>USDT</Th>
                      <Th>Note</Th>
                      <Th>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantPricing.map((row) => (
                      <tr key={row.merchantEmail} className="border-t border-gray-200">
                        <Td>{row.merchantEmail}</Td>
                        <Td>{row.payinSellingFeePercent}%</Td>
                        <Td>{row.payoutSellingFeePercent}%</Td>
                        <Td>{row.payoutAllowed ? "Allowed" : "Blocked"}</Td>
                        <Td>{row.usdtSettlementAllowed ? "Allowed" : "Blocked"}</Td>
                        <Td>{row.note || "-"}</Td>
                        <Td>
                          <button
                            onClick={() => editMerchant(row)}
                            className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
                          >
                            Edit
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
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
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
      />
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-3 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-3">{children}</td>;
}

