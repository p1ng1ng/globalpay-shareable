"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link2, RefreshCw, Save } from "lucide-react";

type Merchant = {
  _id: string;
  email?: string;
  merchantEmail?: string;
  businessName?: string;
  name?: string;
  status?: string;
};

type BankRail = {
  railId: string;
  bankName: string;
  accountLabel: string;
  upiId: string;
  status: string;
  payinStatus: string;
};

type BankRailRoute = {
  _id: string;
  merchantEmail: string;
  railId: string;
  routeName: string;
  bankName: string;
  accountLabel: string;
  upiId: string;
  minAmount: number;
  maxAmount: number;
  priority: number;
  volumeLimit: number;
  usedVolume: number;
  status: string;
  payinStatus: string;
};

export default function AdminBankRailRoutingPage() {
  const [routes, setRoutes] = useState<BankRailRoute[]>([]);
  const [rails, setRails] = useState<BankRail[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [merchantEmail, setMerchantEmail] = useState("");
  const [railId, setRailId] = useState("");
  const [routeName, setRouteName] = useState("");
  const [minAmount, setMinAmount] = useState("1");
  const [maxAmount, setMaxAmount] = useState("100000");
  const [priority, setPriority] = useState("1");
  const [volumeLimit, setVolumeLimit] = useState("0");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/bank-rail-routes", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load bank rail routes");
      }
      setRoutes(data.routes || []);
      setRails(data.rails || []);
      setMerchants(data.merchants || []);
      if (!railId && data.rails?.[0]) setRailId(data.rails[0].railId);
      if (!merchantEmail && data.merchants?.[0]) setMerchantEmail(data.merchants[0].email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load bank rail routes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const selectedRail = rails.find((rail) => rail.railId === railId);
    const response = await fetch("/api/admin/bank-rail-routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        merchantEmail,
        railId,
        routeName: routeName || selectedRail?.accountLabel || selectedRail?.bankName || "Bank rail",
        minAmount: Number(minAmount),
        maxAmount: Number(maxAmount),
        priority: Number(priority),
        volumeLimit: Number(volumeLimit),
        status: "active",
        payinStatus: "active",
      }),
    });
    const data = await response.json();
    setMessage(data.message || (response.ok ? "Route saved" : "Failed to save route"));
    if (response.ok && data.success) {
      setRouteName("");
      await load();
    }
  }

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-600">
              Merchant pay-in assignment
            </p>
            <h1 className="mt-3 text-4xl font-black">Bank Rail Routing</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              Assign active internal UPI rails to merchants by amount range and priority.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </header>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <form onSubmit={save} className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <Link2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Assign rail</h2>
                <p className="text-sm text-gray-600">Select merchant, rail, limits, and priority.</p>
              </div>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-gray-700">
                Merchant
                <select value={merchantEmail} onChange={(event) => setMerchantEmail(event.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900">
                  {merchants.map((merchant) => (
                    <option key={merchant._id} value={merchant.email || merchant.merchantEmail || ""}>
                      {merchant.businessName || merchant.name || merchant.email} - {merchant.email || merchant.merchantEmail}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-gray-700">
                Bank rail
                <select value={railId} onChange={(event) => setRailId(event.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900">
                  {rails.map((rail) => (
                    <option key={rail.railId} value={rail.railId}>
                      {rail.accountLabel || rail.bankName} - {rail.upiId}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Route name" value={routeName} onChange={setRouteName} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Min amount" value={minAmount} onChange={setMinAmount} />
                <Field label="Max amount" value={maxAmount} onChange={setMaxAmount} />
                <Field label="Priority" value={priority} onChange={setPriority} />
                <Field label="Volume limit" value={volumeLimit} onChange={setVolumeLimit} />
              </div>
            </div>

            <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-gray-900 hover:bg-emerald-700">
              <Save className="h-4 w-4" />
              Save route
            </button>
          </form>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-xl font-black">Assigned routes</h2>
            <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-[0.14em] text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Merchant</th>
                    <th className="px-4 py-3">Rail</th>
                    <th className="px-4 py-3">Range</th>
                    <th className="px-4 py-3">Used</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="px-4 py-5 text-gray-600" colSpan={5}>Loading routes...</td></tr>
                  ) : routes.length === 0 ? (
                    <tr><td className="px-4 py-5 text-gray-600" colSpan={5}>No routes configured.</td></tr>
                  ) : (
                    routes.map((route) => (
                      <tr key={route._id} className="border-t border-gray-200">
                        <td className="px-4 py-4 font-bold">{route.merchantEmail}</td>
                        <td className="px-4 py-4">
                          <p className="font-bold">{route.accountLabel || route.bankName}</p>
                          <p className="font-mono text-xs text-blue-700">{route.upiId}</p>
                        </td>
                        <td className="px-4 py-4 text-gray-700">INR {route.minAmount} - {route.maxAmount}</td>
                        <td className="px-4 py-4 text-gray-700">{route.usedVolume} / {route.volumeLimit || "No limit"}</td>
                        <td className="px-4 py-4">
                          <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                            {route.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-gray-700">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-emerald-400" />
    </label>
  );
}


