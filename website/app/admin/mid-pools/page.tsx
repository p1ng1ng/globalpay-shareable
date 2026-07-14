"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type MidPool = {
  _id: string;
  gatewayName: string;
  midName: string;
  midId: string;
  totalLimit: number;
  usedVolume: number;
  remainingLimit: number;
  utilizationPercent: number;
  assignedMerchants: number;
  cycle: string;
  status: string;
  payinStatus: string;
  payoutStatus: string;
  credentialTemplateId: string;
  credentialTemplate: CredentialTemplate | null;
};

type CredentialTemplate = {
  _id: string;
  name: string;
  fieldCount: number;
  usageCount: number;
  fields: Array<{
    key: string;
    label: string;
    hasValue: boolean;
  }>;
};

type Allocation = {
  _id: string;
  merchantEmail: string;
  merchantName: string;
  midPoolId: string;
  gatewayName: string;
  midId: string;
  merchantLimit: number;
  commissionPercent: number;
  status: string;
  payinStatus: string;
  payoutStatus: string;
};

const gatewayOptions = ["RockyPayz", "RupayEx", "Alosheell"];

function money(amount: number) {
  return `INR ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function statusBadgeClass(status: string) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return "bg-emerald-100 text-emerald-600";
  if (value === "paused") return "bg-amber-50 text-amber-600";
  return "bg-red-50 text-red-600";
}

export default function AdminMidPoolsPage() {
  const [midPools, setMidPools] = useState<MidPool[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [templates, setTemplates] = useState<CredentialTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [gatewayName, setGatewayName] = useState("RockyPayz");
  const [midName, setMidName] = useState("");
  const [midId, setMidId] = useState("");
  const [totalLimit, setTotalLimit] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [poolPayinStatus, setPoolPayinStatus] = useState("active");
  const [poolPayoutStatus, setPoolPayoutStatus] = useState("active");
  const [credentialTemplateId, setCredentialTemplateId] = useState("");

  const [merchantEmail, setMerchantEmail] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [selectedMidPoolId, setSelectedMidPoolId] = useState("");
  const [merchantLimit, setMerchantLimit] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("0");
  const [allocationPayinStatus, setAllocationPayinStatus] = useState("active");
  const [allocationPayoutStatus, setAllocationPayoutStatus] = useState("active");

  const loadMidPools = useCallback(async () => {
    try {
      setLoading(true);
      setMessage("");

      const [poolResponse, templateResponse] = await Promise.all([
        fetch("/api/admin/mid-pools", {
          cache: "no-store",
          credentials: "include",
        }),
        fetch("/api/admin/gateway-credential-templates", {
          cache: "no-store",
          credentials: "include",
        }),
      ]);
      const [poolData, templateData] = await Promise.all([
        poolResponse.json(),
        templateResponse.json(),
      ]);

      if (!poolResponse.ok || !poolData.success) {
        setMessage(poolData.message || "Failed to load MID pools");
        return;
      }
      if (!templateResponse.ok || !templateData.success) {
        setMessage(templateData.message || "Failed to load credential templates");
        return;
      }

      setMidPools(poolData.midPools || []);
      setAllocations(poolData.allocations || []);
      setTemplates(templateData.templates || []);
    } catch {
      setMessage("Failed to load MID pools.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function createMidPool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setMessage("");

      const response = await fetch("/api/admin/mid-pools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          gatewayName,
          midName,
          midId,
          totalLimit: Number(totalLimit),
          cycle,
          payinStatus: poolPayinStatus,
          payoutStatus: poolPayoutStatus,
          credentialTemplateId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to create MID pool");
        return;
      }

      setMessage("MID pool created successfully");
      setMidName("");
      setMidId("");
      setTotalLimit("");
      setPoolPayinStatus("active");
      setPoolPayoutStatus("active");
      setCredentialTemplateId("");
      await loadMidPools();
    } catch {
      setMessage("Failed to create MID pool.");
    }
  }

  async function createAllocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setMessage("");

      const response = await fetch("/api/admin/mid-allocations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          merchantEmail,
          merchantName,
          midPoolId: selectedMidPoolId,
          merchantLimit: Number(merchantLimit),
          commissionPercent: Number(commissionPercent),
          payinStatus: allocationPayinStatus,
          payoutStatus: allocationPayoutStatus,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to assign merchant");
        return;
      }

      setMessage("Merchant assigned to MID pool successfully");
      setMerchantEmail("");
      setMerchantName("");
      setSelectedMidPoolId("");
      setMerchantLimit("");
      setCommissionPercent("0");
      setAllocationPayinStatus("active");
      setAllocationPayoutStatus("active");
      await loadMidPools();
    } catch {
      setMessage("Failed to assign merchant.");
    }
  }

  async function updatePoolTemplate(poolId: string, templateId: string) {
    try {
      setMessage("");
      const response = await fetch(`/api/admin/mid-pools/${poolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credentialTemplateId: templateId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update MID credentials");
      }
      setMessage("MID credential template updated");
      await loadMidPools();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to update MID credentials"
      );
    }
  }

  async function updatePoolStatus(pool: MidPool, status: "active" | "paused" | "blocked") {
    try {
      setMessage("");
      const response = await fetch(`/api/admin/mid-pools/${pool._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update MID status");
      }
      setMessage(`${pool.gatewayName} ${pool.midName} marked ${status}.`);
      await loadMidPools();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update MID status"
      );
    }
  }

  async function updatePoolDirectionStatus(
    pool: MidPool,
    direction: "payinStatus" | "payoutStatus",
    status: "active" | "paused" | "blocked"
  ) {
    try {
      setMessage("");
      const response = await fetch(`/api/admin/mid-pools/${pool._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [direction]: status }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update MID direction status");
      }
      setMessage(`${pool.gatewayName} ${direction === "payinStatus" ? "pay-in" : "payout"} marked ${status}.`);
      await loadMidPools();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update MID direction status"
      );
    }
  }

  async function updateAllocationDirectionStatus(
    allocation: Allocation,
    direction: "payinStatus" | "payoutStatus",
    status: "active" | "paused" | "blocked"
  ) {
    try {
      setMessage("");
      const response = await fetch(`/api/admin/mid-allocations/${allocation._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [direction]: status }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update allocation direction status");
      }
      setMessage(`${allocation.gatewayName} ${direction === "payinStatus" ? "pay-in" : "payout"} marked ${status}.`);
      await loadMidPools();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update allocation direction status"
      );
    }
  }

  useEffect(() => {
    // Initial remote data hydration is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMidPools();
  }, [loadMidPools]);

  const selectedCredentialTemplate = templates.find(
    (template) => template._id === credentialTemplateId
  );

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-600">
              Wpay Admin
            </p>
            <h1 className="text-4xl font-black">MID Pools</h1>
            <p className="mt-2 text-gray-600">
              Manage your company Paytm MID and assign internal merchant limits.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadMidPools}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Refresh
            </button>

            <Link
              href="/admin/gateway-credentials"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Credential Templates
            </Link>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={createMidPool}
            className="rounded-3xl border border-gray-200 bg-white p-6"
          >
            <h2 className="text-2xl font-black">Create Master MID Pool</h2>
            <p className="mt-2 text-sm text-gray-600">
              Example: Paytm Main MID with ₹50,00,000 total limit.
            </p>

            <div className="mt-6 grid gap-4">
              <select
                value={gatewayName}
                onChange={(event) => setGatewayName(event.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              >
                {gatewayOptions.map((gateway) => (
                  <option key={gateway} value={gateway}>
                    {gateway}
                  </option>
                ))}
              </select>

              <select
                value={credentialTemplateId}
                onChange={(event) =>
                  setCredentialTemplateId(event.target.value)
                }
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              >
                <option value="">Select credential template</option>
                {templates.map((template) => (
                  <option key={template._id} value={template._id}>
                    {template.name} ({template.fieldCount} fields)
                  </option>
                ))}
              </select>

              {!templates.length ? (
                <Link
                  href="/admin/gateway-credentials"
                  className="text-sm font-bold text-amber-600"
                >
                  Create a credential template before adding a MID.
                </Link>
              ) : null}

              {selectedCredentialTemplate ? (
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
                  <p className="text-xs font-black uppercase text-amber-600">
                    Fields loaded from template
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedCredentialTemplate.fields.map((field) => (
                      <span
                        key={field.key}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
                      >
                        {field.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <input
                value={midName}
                onChange={(event) => setMidName(event.target.value)}
                placeholder="MID Name, e.g. Paytm Main MID"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              />

              <input
                value={midId}
                onChange={(event) => setMidId(event.target.value)}
                placeholder="MID ID"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              />

              <input
                type="number"
                value={totalLimit}
                onChange={(event) => setTotalLimit(event.target.value)}
                placeholder="Total Limit, e.g. 5000000"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              />

              <select
                value={cycle}
                onChange={(event) => setCycle(event.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
              >
                <option value="monthly">Monthly Limit</option>
                <option value="daily">Daily Limit</option>
              </select>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-gray-700">Pool pay-in</span>
                  <select
                    value={poolPayinStatus}
                    onChange={(event) => setPoolPayinStatus(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                  >
                    <option value="active">Pay-in active</option>
                    <option value="paused">Pay-in paused</option>
                    <option value="blocked">Pay-in blocked</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-gray-700">Pool payout</span>
                  <select
                    value={poolPayoutStatus}
                    onChange={(event) => setPoolPayoutStatus(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                  >
                    <option value="active">Payout active</option>
                    <option value="paused">Payout paused</option>
                    <option value="blocked">Payout blocked</option>
                  </select>
                </label>
              </div>

              <button className="rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-gray-900 hover:bg-blue-700">
                Create MID Pool
              </button>
            </div>
          </form>

          <form
            onSubmit={createAllocation}
            className="rounded-3xl border border-gray-200 bg-white p-6"
          >
            <h2 className="text-2xl font-black">Assign Merchant to MID</h2>
            <p className="mt-2 text-sm text-gray-600">
              Set merchant limit and commission under your company MID.
            </p>

            <div className="mt-6 grid gap-4">
              <select
                value={selectedMidPoolId}
                onChange={(event) => setSelectedMidPoolId(event.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              >
                <option value="">Select MID Pool</option>
                {midPools
                  .filter((pool) => pool.status === "active")
                  .map((pool) => (
                  <option key={pool._id} value={pool._id}>
                    {pool.gatewayName} - {pool.midName} - {pool.midId}
                  </option>
                ))}
              </select>

              <input
                type="email"
                value={merchantEmail}
                onChange={(event) => setMerchantEmail(event.target.value)}
                placeholder="Merchant login email"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              />

              <input
                value={merchantName}
                onChange={(event) => setMerchantName(event.target.value)}
                placeholder="Merchant name / business name"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
              />

              <input
                type="number"
                value={merchantLimit}
                onChange={(event) => setMerchantLimit(event.target.value)}
                placeholder="Merchant Limit, e.g. 1000000"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                required
              />

              <input
                type="number"
                step="0.01"
                value={commissionPercent}
                onChange={(event) => setCommissionPercent(event.target.value)}
                placeholder="Commission %, e.g. 1.5"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-gray-700">Merchant pay-in</span>
                  <select
                    value={allocationPayinStatus}
                    onChange={(event) => setAllocationPayinStatus(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                  >
                    <option value="active">Pay-in active</option>
                    <option value="paused">Pay-in paused</option>
                    <option value="blocked">Pay-in blocked</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-gray-700">Merchant payout</span>
                  <select
                    value={allocationPayoutStatus}
                    onChange={(event) => setAllocationPayoutStatus(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950"
                  >
                    <option value="active">Payout active</option>
                    <option value="paused">Payout paused</option>
                    <option value="blocked">Payout blocked</option>
                  </select>
                </label>
              </div>

              <button className="rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-gray-900 hover:bg-emerald-700">
                Assign Merchant
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-black">Master MID Pools</h2>
          </div>

          {loading ? (
            <div className="p-8 text-gray-700">Loading MID pools...</div>
          ) : midPools.length === 0 ? (
            <div className="p-8 text-gray-700">No MID pools created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-5 py-4">Gateway / MID</th>
                    <th className="px-5 py-4">Limit</th>
                    <th className="px-5 py-4">Used</th>
                    <th className="px-5 py-4">Remaining</th>
                    <th className="px-5 py-4">Utilization</th>
                    <th className="px-5 py-4">Merchants</th>
                    <th className="px-5 py-4">Credential template</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {midPools.map((pool) => (
                    <tr key={pool._id} className="border-t border-gray-200">
                      <td className="px-5 py-4">
                        <p className="font-black">{pool.gatewayName}</p>
                        <p className="text-gray-600">{pool.midName}</p>
                        <p className="font-mono text-xs text-blue-700">{pool.midId}</p>
                      </td>
                      <td className="px-5 py-4 font-bold">{money(pool.totalLimit)}</td>
                      <td className="px-5 py-4 font-bold text-emerald-600">
                        {money(pool.usedVolume)}
                      </td>
                      <td className="px-5 py-4 font-bold text-blue-600">
                        {money(pool.remainingLimit)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-50">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{
                              width: `${Math.min(100, pool.utilizationPercent)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-600">
                          {pool.utilizationPercent}%
                        </p>
                      </td>
                      <td className="px-5 py-4">{pool.assignedMerchants}</td>
                      <td className="px-5 py-4">
                        <select
                          value={pool.credentialTemplateId || ""}
                          onChange={(event) =>
                            updatePoolTemplate(pool._id, event.target.value)
                          }
                          className="min-w-52 rounded-lg border border-gray-200 bg-white px-3 py-2 text-slate-950"
                        >
                          <option value="" disabled>
                            Select template
                          </option>
                          {templates.map((template) => (
                            <option key={template._id} value={template._id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-600">
                          {pool.credentialTemplate?.fieldCount || 0} fields loaded
                        </p>
                        {pool.credentialTemplate ? (
                          <div className="mt-2 flex max-w-72 flex-wrap gap-1.5">
                            {pool.credentialTemplate.fields.map((field) => (
                              <span
                                key={field.key}
                                className={`rounded-full border px-2 py-1 text-[11px] font-bold ${
                                  field.hasValue
                                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                    : "border-red-300 bg-red-50 text-red-700"
                                }`}
                                title={`${field.label}: ${
                                  field.hasValue ? "configured" : "missing"
                                }`}
                              >
                                {field.key}: {field.hasValue ? "set" : "missing"}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(pool.status)}`}>
                            pool {pool.status}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusBadgeClass(pool.payinStatus)}`}>
                              pay-in {pool.payinStatus}
                            </span>
                            <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusBadgeClass(pool.payoutStatus)}`}>
                              payout {pool.payoutStatus}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {pool.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => updatePoolStatus(pool, "paused")}
                              className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-50"
                            >
                              Pause
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updatePoolStatus(pool, "active")}
                              className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                            >
                              Resume
                            </button>
                          )}
                          {pool.status !== "blocked" ? (
                            <button
                              type="button"
                              onClick={() => updatePoolStatus(pool, "blocked")}
                              className="rounded-lg border border-red-300 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50"
                            >
                              Block
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              updatePoolDirectionStatus(
                                pool,
                                "payinStatus",
                                pool.payinStatus === "active" ? "paused" : "active"
                              )
                            }
                            className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
                          >
                            {pool.payinStatus === "active" ? "Pause Pay-in" : "Resume Pay-in"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePoolDirectionStatus(
                                pool,
                                "payoutStatus",
                                pool.payoutStatus === "active" ? "paused" : "active"
                              )
                            }
                            className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-black text-violet-200 hover:bg-violet-400/10"
                          >
                            {pool.payoutStatus === "active" ? "Pause Payout" : "Resume Payout"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-black">Merchant MID Allocations</h2>
          </div>

          {allocations.length === 0 ? (
            <div className="p-8 text-gray-700">No merchant allocations yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-5 py-4">Merchant</th>
                    <th className="px-5 py-4">Gateway / MID</th>
                    <th className="px-5 py-4">Merchant Limit</th>
                    <th className="px-5 py-4">Commission</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {allocations.map((allocation) => (
                    <tr key={allocation._id} className="border-t border-gray-200">
                      <td className="px-5 py-4">
                        <p className="font-black">{allocation.merchantName || "-"}</p>
                        <p className="text-gray-600">{allocation.merchantEmail}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p>{allocation.gatewayName}</p>
                        <p className="font-mono text-xs text-blue-700">
                          {allocation.midId}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {money(allocation.merchantLimit)}
                      </td>
                      <td className="px-5 py-4">{allocation.commissionPercent}%</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(allocation.status)}`}>
                            {allocation.status}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusBadgeClass(allocation.payinStatus)}`}>
                            pay-in {allocation.payinStatus}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusBadgeClass(allocation.payoutStatus)}`}>
                            payout {allocation.payoutStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateAllocationDirectionStatus(
                                allocation,
                                "payinStatus",
                                allocation.payinStatus === "active" ? "paused" : "active"
                              )
                            }
                            className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
                          >
                            {allocation.payinStatus === "active" ? "Pause Pay-in" : "Resume Pay-in"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateAllocationDirectionStatus(
                                allocation,
                                "payoutStatus",
                                allocation.payoutStatus === "active" ? "paused" : "active"
                              )
                            }
                            className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-black text-violet-200 hover:bg-violet-400/10"
                          >
                            {allocation.payoutStatus === "active" ? "Pause Payout" : "Resume Payout"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

