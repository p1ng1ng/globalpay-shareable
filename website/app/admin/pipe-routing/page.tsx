"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Merchant = {
  _id: string;
  email?: string;
  merchantEmail?: string;
  businessName?: string;
  name?: string;
  status?: string;
};

type MidPool = {
  _id: string;
  gatewayName: string;
  midName: string;
  midId: string;
  status: string;
};

type PipeRoute = {
  _id: string;
  merchantEmail: string;
  pipeName: string;
  gatewayName: string;
  midPoolId: string;
  midId: string;
  providerMerchantId: string;
  minAmount: number;
  maxAmount: number;
  priority: number;
  volumeLimit: number;
  usedVolume: number;
  status: string;
  payinStatus: string;
  payoutStatus: string;
  autoDisableOnLimit: boolean;
  notes: string;
};

function money(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export default function PipeRoutingPage() {
  const [routes, setRoutes] = useState<PipeRoute[]>([]);
  const [midPools, setMidPools] = useState<MidPool[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [id, setId] = useState("");
  const [merchantEmail, setMerchantEmail] = useState("joy@joy.com");
  const [selectedPipe, setSelectedPipe] = useState("openpay");
  const [minAmount, setMinAmount] = useState("300");
  const [maxAmount, setMaxAmount] = useState("5000");
  const [priority, setPriority] = useState("100");
  const [volumeLimit, setVolumeLimit] = useState("2000000");
  const [status, setStatus] = useState("active");
  const [payinStatus, setPayinStatus] = useState("active");
  const [payoutStatus, setPayoutStatus] = useState("active");

  const pipeOptions = useMemo(() => {
    const base = [
      { key: "openpay", label: "OpenPay" },
      { key: "alosheell", label: "Alosheell" },
      { key: "jupitor", label: "Jupitor" },
      { key: "rockypayz", label: "RockyPayz" },
      { key: "rupayex", label: "RupayEx" },
      { key: "sabpaisa", label: "SabPaisa" },
    ];

    const poolOptions = midPools.map((pool) => ({
      key: `pool:${pool._id}`,
      label: `${pool.gatewayName} - ${pool.midName || pool.midId}`,
    }));

    return [...base, ...poolOptions];
  }, [midPools]);

  function selectedPool() {
    if (!selectedPipe.startsWith("pool:")) return null;
    const poolId = selectedPipe.replace("pool:", "");
    return midPools.find((p) => p._id === poolId) || null;
  }

  function selectedGatewayName() {
    const pool = selectedPool();
    if (pool) return String(pool.gatewayName || "").toLowerCase();
    return selectedPipe;
  }

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/pipe-routing", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "Failed to load pipe routing");
        return;
      }

      setRoutes(data.routes || []);
      setMidPools(data.midPools || []);
      setMerchants(data.merchants || []);
    } catch {
      setMessage("Failed to load pipe routing");
    } finally {
      setLoading(false);
    }
  }

  function edit(route: PipeRoute) {
    setId(route._id);
    setMerchantEmail(route.merchantEmail);
    setSelectedPipe(route.midPoolId ? `pool:${route.midPoolId}` : route.gatewayName);
    setMinAmount(String(route.minAmount || 1));
    setMaxAmount(String(route.maxAmount || 100000));
    setPriority(String(route.priority || 100));
    setVolumeLimit(String(route.volumeLimit || 0));
    setStatus(route.status || "active");
    setPayinStatus(route.payinStatus || route.status || "active");
    setPayoutStatus(route.payoutStatus || route.status || "active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setId("");
    setMerchantEmail("joy@joy.com");
    setSelectedPipe("openpay");
    setMinAmount("300");
    setMaxAmount("5000");
    setPriority("100");
    setVolumeLimit("2000000");
    setStatus("active");
    setPayinStatus("active");
    setPayoutStatus("active");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const pool = selectedPool();
    const gatewayName = selectedGatewayName();

    const res = await fetch("/api/admin/pipe-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        merchantEmail,
        pipeName: pool ? `${pool.gatewayName} - ${pool.midName || pool.midId}` : gatewayName,
        gatewayName,
        midPoolId: pool?._id || "",
        midId: pool?.midId || "",
        providerMerchantId: pool?.midId || "",
        minAmount: Number(minAmount),
        maxAmount: Number(maxAmount),
        priority: Number(priority),
        volumeLimit: Number(volumeLimit),
        status,
        payinStatus,
        payoutStatus,
        autoDisableOnLimit: true,
        notes: "",
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      setMessage(data.message || "Failed to save pipe route");
      return;
    }

    setMessage("Pipe route saved successfully");
    resetForm();
    await load();
  }

  async function quickStatus(route: PipeRoute, nextStatus: string) {
    const res = await fetch("/api/admin/pipe-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...route, id: route._id, status: nextStatus }),
    });

    const data = await res.json();
    setMessage(data.message || "Updated");
    await load();
  }

  async function quickDirectionStatus(
    route: PipeRoute,
    direction: "payinStatus" | "payoutStatus",
    nextStatus: string
  ) {
    const res = await fetch("/api/admin/pipe-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...route, id: route._id, [direction]: nextStatus }),
    });

    const data = await res.json();
    setMessage(data.message || "Updated");
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-emerald-600">
              Wpay Admin
            </p>
            <h1 className="text-4xl font-black">Pipe Routing</h1>
            <p className="mt-2 text-gray-600">
              Select merchant, pipe, amount range, priority and total volume limit.
              Add multiple rows for the same merchant to run multiple pipelines.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={load}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Refresh
            </button>

            <Link
              href="/admin/dashboard"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        ) : null}

        <form onSubmit={save} className="mb-8 rounded-3xl border border-gray-200 bg-white p-6">
          <h2 className="text-2xl font-black">{id ? "Edit Pipe Route" : "Add Pipe Route"}</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Merchant</label>
              <select
                value={merchantEmail}
                onChange={(e) => setMerchantEmail(e.target.value)}
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
                required
              >
                <option value="">Select merchant</option>
                {merchants.map((merchant) => {
                  const email = String(merchant.email || merchant.merchantEmail || "").toLowerCase();
                  const label = merchant.businessName || merchant.name || email;
                  if (!email) return null;

                  return (
                    <option key={merchant._id || email} value={email}>
                      {label} - {email}
                    </option>
                  );
                })}

                {merchantEmail &&
                !merchants.some(
                  (m) =>
                    String(m.email || m.merchantEmail || "").toLowerCase() ===
                    merchantEmail.toLowerCase()
                ) ? (
                  <option value={merchantEmail}>{merchantEmail}</option>
                ) : null}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Pipe / MID</label>
              <select
                value={selectedPipe}
                onChange={(e) => setSelectedPipe(e.target.value)}
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
                required
              >
                {pipeOptions.map((pipe) => (
                  <option key={pipe.key} value={pipe.key}>
                    {pipe.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Value From</label>
              <input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="300"
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Value To</label>
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="5000"
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Limit</label>
              <input
                type="number"
                value={volumeLimit}
                onChange={(e) => setVolumeLimit(e.target.value)}
                placeholder="2000000"
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="100"
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
              />
              <p className="mt-1 text-xs text-gray-500">Lower priority is tried first.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="paused">Paused</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Pay-in</label>
              <select
                value={payinStatus}
                onChange={(e) => setPayinStatus(e.target.value)}
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
              >
                <option value="active">Pay-in active</option>
                <option value="paused">Pay-in paused</option>
                <option value="blocked">Pay-in blocked</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">Payout</label>
              <select
                value={payoutStatus}
                onChange={(e) => setPayoutStatus(e.target.value)}
                className="w-full rounded-xl bg-white px-4 py-3 text-gray-900"
              >
                <option value="active">Payout active</option>
                <option value="paused">Payout paused</option>
                <option value="blocked">Payout blocked</option>
              </select>
            </div>

            <div className="flex items-end">
              <button className="w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black hover:bg-emerald-700">
                Save Pipe Route
              </button>
            </div>

            {id ? (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full rounded-xl border border-gray-200 px-5 py-4 text-sm font-black hover:bg-gray-50"
                >
                  Cancel Edit
                </button>
              </div>
            ) : null}
          </div>
        </form>

        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-black">Merchant Active Pipes</h2>
          </div>

          {loading ? (
            <div className="p-8 text-gray-700">Loading...</div>
          ) : routes.length === 0 ? (
            <div className="p-8 text-gray-700">No pipe routes created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-5 py-4">Merchant</th>
                    <th className="px-5 py-4">Pipe / MID</th>
                    <th className="px-5 py-4">Value</th>
                    <th className="px-5 py-4">Priority</th>
                    <th className="px-5 py-4">Used / Limit</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {routes.map((route) => {
                    const pct =
                      route.volumeLimit > 0
                        ? Math.min(
                            100,
                            (Number(route.usedVolume || 0) / Number(route.volumeLimit || 1)) * 100
                          )
                        : 0;

                    return (
                      <tr key={route._id} className="border-t border-gray-200">
                        <td className="px-5 py-4 font-black">{route.merchantEmail}</td>

                        <td className="px-5 py-4">
                          <p className="font-black">{route.pipeName || route.gatewayName}</p>
                          <p className="font-mono text-xs text-blue-700">
                            {route.providerMerchantId || route.midId || route.gatewayName}
                          </p>
                        </td>

                        <td className="px-5 py-4 font-bold">
                          {money(route.minAmount)} - {money(route.maxAmount)}
                        </td>

                        <td className="px-5 py-4 font-mono text-gray-700">
                          {route.priority ?? 100}
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold">
                            {money(route.usedVolume)} /{" "}
                            {route.volumeLimit ? money(route.volumeLimit) : "Unlimited"}
                          </p>

                          {route.volumeLimit ? (
                            <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-gray-50">
                              <div
                                className="h-full rounded-full bg-emerald-400"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          ) : null}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              route.status === "active"
                                ? "bg-emerald-100 text-emerald-600"
                                : "bg-red-50 text-red-600"
                            }`}
                          >
                            {route.status}
                          </span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                route.payinStatus === "active"
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-amber-50 text-amber-600"
                              }`}
                            >
                              pay-in {route.payinStatus}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                route.payoutStatus === "active"
                                  ? "bg-emerald-100 text-emerald-600"
                                  : "bg-amber-50 text-amber-600"
                              }`}
                            >
                              payout {route.payoutStatus}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => edit(route)}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold hover:bg-blue-700"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                quickStatus(route, route.status === "active" ? "inactive" : "active")
                              }
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                            >
                              {route.status === "active" ? "Turn Off" : "Turn On"}
                            </button>
                            <button
                              onClick={() =>
                                quickDirectionStatus(
                                  route,
                                  "payinStatus",
                                  route.payinStatus === "active" ? "paused" : "active"
                                )
                              }
                              className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                            >
                              {route.payinStatus === "active" ? "Pause Pay-in" : "Resume Pay-in"}
                            </button>
                            <button
                              onClick={() =>
                                quickDirectionStatus(
                                  route,
                                  "payoutStatus",
                                  route.payoutStatus === "active" ? "paused" : "active"
                                )
                              }
                              className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-400/10"
                            >
                              {route.payoutStatus === "active" ? "Pause Payout" : "Resume Payout"}
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

