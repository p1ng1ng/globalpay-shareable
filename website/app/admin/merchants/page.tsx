"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

type GatewayAllocation = {
  _id: string;
  gatewayName: string;
  midId: string;
  midPoolId: string;
  merchantLimit: number;
  commissionPercent: number;
  status: "active" | "paused" | "blocked";
  payinStatus: "active" | "paused" | "blocked";
  payoutStatus: "active" | "paused" | "blocked";
};

type Merchant = {
  _id: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  businessType: string;
  status: "pending" | "active" | "blocked";
  totalVolume: number;
  totalTransactions: number;
  activationCount?: number;
  lastActivatedAt?: string;
  createdAt: string;
  gatewayAllocations: GatewayAllocation[];
};

type MidPool = {
  _id: string;
  gatewayName: string;
  midName: string;
  midId: string;
  totalLimit: number;
  remainingLimit: number;
  status: string;
  payinStatus: string;
  payoutStatus: string;
};

type MerchantRow = {
  merchant: Merchant;
  allocation: GatewayAllocation | null;
};

const gatewayOptions = ["RockyPayz", "RupayEx", "Alosheell"];

const emptyAssignment = {
  midPoolId: "",
  merchantLimit: "",
  commissionPercent: "0",
  payinStatus: "active",
  payoutStatus: "active",
};

function money(amount: number) {
  return `INR ${Number(amount || 0).toLocaleString("en-IN")}`;
}

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [midPools, setMidPools] = useState<MidPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [assigningMerchant, setAssigningMerchant] = useState<Merchant | null>(
    null
  );
  const [assignment, setAssignment] = useState(emptyAssignment);
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [merchantResponse, poolResponse] = await Promise.all([
        fetch("/api/merchants", { cache: "no-store", credentials: "include" }),
        fetch("/api/admin/mid-pools", {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const [merchantData, poolData] = await Promise.all([
        merchantResponse.json(),
        poolResponse.json(),
      ]);

      if (!merchantResponse.ok || !merchantData.success) {
        throw new Error(merchantData.message || "Failed to load merchants");
      }

      if (!poolResponse.ok || !poolData.success) {
        throw new Error(poolData.message || "Failed to load MID pools");
      }

      setMerchants(merchantData.merchants || []);
      setMidPools(
        (poolData.midPools || []).filter(
          (pool: MidPool) => pool.status === "active"
        )
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to load merchants"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial remote data hydration is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const pendingMerchants = useMemo(
    () => merchants.filter((merchant) => merchant.status === "pending"),
    [merchants]
  );

  const linkableMerchants = useMemo(
    () => merchants.filter((merchant) => merchant.status !== "pending"),
    [merchants]
  );

  const rows = useMemo<MerchantRow[]>(
    () =>
      linkableMerchants.flatMap((merchant): MerchantRow[] => {
        if (!merchant.gatewayAllocations?.length) {
          return [{ merchant, allocation: null }];
        }

        return merchant.gatewayAllocations.map((allocation) => ({
          merchant,
          allocation,
        }));
      }),
    [linkableMerchants]
  );

  async function updateMerchant(
    merchant: Merchant,
    status: Merchant["status"]
  ) {
    setSavingId(merchant._id);
    setMessage("");

    try {
      const response = await fetch(`/api/merchants/${merchant._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Merchant update failed");
      }

      setMessageType("success");
      setMessage(data.message || "Merchant updated.");
      await loadData();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Merchant update failed"
      );
    } finally {
      setSavingId("");
    }
  }

  async function createAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assigningMerchant) return;

    setSavingId(`assign-${assigningMerchant._id}`);
    setMessage("");

    try {
      const response = await fetch("/api/admin/mid-allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          merchantEmail: assigningMerchant.email,
          merchantName: assigningMerchant.businessName,
          midPoolId: assignment.midPoolId,
          merchantLimit: Number(assignment.merchantLimit),
          commissionPercent: Number(assignment.commissionPercent),
          payinStatus: assignment.payinStatus,
          payoutStatus: assignment.payoutStatus,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Gateway assignment failed");
      }

      setMessageType("success");
      setMessage(
        `${data.allocation.gatewayName} assigned to ${assigningMerchant.businessName}.`
      );
      setAssigningMerchant(null);
      setAssignment(emptyAssignment);
      await loadData();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Gateway assignment failed"
      );
    } finally {
      setSavingId("");
    }
  }

  async function updateAllocation(
    allocation: GatewayAllocation,
    status: GatewayAllocation["status"],
    direction?: "payinStatus" | "payoutStatus"
  ) {
    setSavingId(allocation._id);
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/mid-allocations/${allocation._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(direction ? { [direction]: status } : { status }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Assignment update failed");
      }

      setMessageType("success");
      setMessage(data.message || "Gateway assignment updated.");
      await loadData();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Assignment update failed"
      );
    } finally {
      setSavingId("");
    }
  }

  async function removeAllocation(allocation: GatewayAllocation) {
    if (
      !window.confirm(
        `Remove ${allocation.gatewayName} (${allocation.midId}) from this merchant?`
      )
    ) {
      return;
    }

    setSavingId(allocation._id);
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/mid-allocations/${allocation._id}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to remove assignment");
      }

      setMessageType("success");
      setMessage("Gateway assignment removed.");
      await loadData();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to remove assignment"
      );
    } finally {
      setSavingId("");
    }
  }

  function openAssignment(merchant: Merchant) {
    if (merchant.status !== "active") {
      setMessageType("error");
      setMessage("Approve and activate this merchant before assigning a MID.");
      return;
    }
    setAssigningMerchant(merchant);
    setAssignment(emptyAssignment);
    setGatewayFilter("all");
  }

  const selectedPool = midPools.find(
    (pool) => pool._id === assignment.midPoolId
  );
  const filteredMidPools = midPools.filter(
    (pool) => gatewayFilter === "all" || pool.gatewayName === gatewayFilter
  );

  return (
    <main>
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-blue-600">
              Merchant operations
            </p>
            <h1 className="mt-2 text-4xl font-black">Merchants</h1>
            <p className="mt-2 max-w-3xl text-gray-600">
              Activate merchant accounts and assign one or more payment gateway
              pipes. Each gateway assignment is listed as a separate row.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Total merchants</p>
            <p className="mt-2 text-3xl font-black">{merchants.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Active merchants</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">
              {merchants.filter((merchant) => merchant.status === "active").length}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Gateway assignments</p>
            <p className="mt-2 text-3xl font-black text-blue-600">
              {merchants.reduce(
                (total, merchant) =>
                  total + (merchant.gatewayAllocations?.length || 0),
                0
              )}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Pending signups</p>
            <p className="mt-2 text-3xl font-black text-amber-600">
              {pendingMerchants.length}
            </p>
          </div>
        </div>

        {message ? (
          <div
            className={`mt-6 rounded-xl border px-4 py-3 text-sm font-semibold ${
              messageType === "success"
                ? "border-emerald-200 bg-emerald-100 text-emerald-100"
                : "border-red-200 bg-red-50 text-red-100"
            }`}
          >
            {message}
          </div>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-xl border border-amber-400/20 bg-amber-50">
          <div className="flex flex-col gap-2 border-b border-amber-400/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black text-amber-50">New signup validation</h2>
              <p className="mt-1 text-xs text-amber-100/80">
                Approve merchant applications here before they appear in MID linking.
              </p>
            </div>
            <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-black text-amber-100">
              {pendingMerchants.length} pending
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-amber-100/80">Loading signups...</div>
          ) : pendingMerchants.length === 0 ? (
            <div className="p-8 text-amber-100/80">
              No new merchant signups are waiting for validation.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-amber-300/10 text-amber-100/80">
                  <tr>
                    <th className="px-5 py-4">Business</th>
                    <th className="px-5 py-4">Owner</th>
                    <th className="px-5 py-4">Contact</th>
                    <th className="px-5 py-4">Signup date</th>
                    <th className="px-5 py-4 text-right">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingMerchants.map((merchant) => (
                    <tr key={merchant._id} className="border-t border-amber-400/20">
                      <td className="px-5 py-5">
                        <p className="font-black text-gray-900">{merchant.businessName}</p>
                        <p className="mt-1 text-xs text-amber-100/70">{merchant.businessType}</p>
                      </td>
                      <td className="px-5 py-5 text-amber-50">{merchant.ownerName}</td>
                      <td className="px-5 py-5 text-amber-50">
                        <p>{merchant.email}</p>
                        <p className="mt-1 text-xs text-amber-100/70">{merchant.phone || "-"}</p>
                      </td>
                      <td className="px-5 py-5 text-amber-100/80">
                        {merchant.createdAt ? new Date(merchant.createdAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={savingId === merchant._id}
                            onClick={() => updateMerchant(merchant, "active")}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-gray-900 hover:bg-emerald-700 disabled:opacity-40"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Allow
                          </button>
                          <button
                            type="button"
                            disabled={savingId === merchant._id}
                            onClick={() => updateMerchant(merchant, "blocked")}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-300/40 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-50 disabled:opacity-40"
                          >
                            <CirclePause className="h-4 w-4" />
                            Reject
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

        <section className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black">Merchant gateway assignments</h2>
              <p className="mt-1 text-xs text-gray-600">
                {rows.length} listing rows across {linkableMerchants.length} approved merchants
              </p>
            </div>
            {midPools.length === 0 ? (
              <p className="text-xs font-semibold text-amber-600">
                Create an active MID pool before assigning a gateway.
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="p-8 text-gray-600">Loading merchants...</div>
          ) : merchants.length === 0 ? (
            <div className="p-8 text-gray-600">
              No merchants found. Create a merchant from the signup page first.
            </div>
          ) : linkableMerchants.length === 0 ? (
            <div className="p-8 text-gray-600">
              Approve a signup before linking merchant MIDs.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="bg-white text-gray-600">
                  <tr>
                    <th className="px-5 py-4">Merchant</th>
                    <th className="px-5 py-4">Contact</th>
                    <th className="px-5 py-4">Account</th>
                    <th className="px-5 py-4">Gateway / MID</th>
                    <th className="px-5 py-4">Limit</th>
                    <th className="px-5 py-4">Commission</th>
                    <th className="px-5 py-4">Pipe status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ merchant, allocation }) => (
                    <tr
                      key={`${merchant._id}-${allocation?._id || "unassigned"}`}
                      className="border-t border-gray-200 align-middle"
                    >
                      <td className="px-5 py-5">
                        <p className="font-bold text-gray-900">
                          {merchant.businessName}
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                          {merchant.ownerName} · {merchant.businessType}
                        </p>
                      </td>
                      <td className="px-5 py-5 text-gray-700">
                        <p>{merchant.email}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {merchant.phone || "-"}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            merchant.status === "active"
                              ? "bg-emerald-100 text-emerald-600"
                              : merchant.status === "blocked"
                                ? "bg-red-50 text-red-600"
                                : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {merchant.status}
                        </span>
                        <p className="mt-2 text-xs text-gray-500">
                          {merchant.activationCount || 0} activations
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        {allocation ? (
                          <>
                            <p className="font-bold text-gray-900">
                              {allocation.gatewayName}
                            </p>
                            <p className="mt-1 font-mono text-xs text-blue-600">
                              {allocation.midId}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-500">Not assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-5 font-semibold text-gray-700">
                        {allocation ? money(allocation.merchantLimit) : "-"}
                      </td>
                      <td className="px-5 py-5 text-gray-700">
                        {allocation ? `${allocation.commissionPercent}%` : "-"}
                      </td>
                      <td className="px-5 py-5">
                        {allocation ? (
                          <>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                allocation.status === "active"
                                  ? "bg-blue-50 text-blue-600"
                                  : allocation.status === "paused"
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-red-50 text-red-600"
                              }`}
                            >
                              {allocation.status}
                            </span>
                            <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                allocation.payinStatus === "active"
                                  ? "bg-emerald-100 text-emerald-600"
                                  : allocation.payinStatus === "paused"
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-red-50 text-red-600"
                              }`}
                            >
                              pay-in {allocation.payinStatus}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                allocation.payoutStatus === "active"
                                  ? "bg-emerald-100 text-emerald-600"
                                  : allocation.payoutStatus === "paused"
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-red-50 text-red-600"
                              }`}
                            >
                              payout {allocation.payoutStatus}
                            </span>
                            </div>
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            title="Assign another gateway"
                            disabled={midPools.length === 0 || merchant.status !== "active"}
                            onClick={() => openAssignment(merchant)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-gray-900 hover:bg-blue-700 disabled:opacity-40"
                          >
                            <Plus className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            title={
                              merchant.status === "active"
                                ? "Activate merchant again"
                                : "Activate merchant"
                            }
                            disabled={savingId === merchant._id}
                            onClick={() => updateMerchant(merchant, "active")}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-300 text-emerald-600 hover:bg-emerald-100 disabled:opacity-40"
                          >
                            <CirclePlay className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            title="Block merchant"
                            disabled={savingId === merchant._id}
                            onClick={() => updateMerchant(merchant, "blocked")}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40"
                          >
                            <CirclePause className="h-4 w-4" />
                          </button>

                          {allocation ? (
                            <>
                              <button
                                type="button"
                                title={
                                  allocation.status === "active"
                                    ? "Pause gateway"
                                    : "Resume gateway"
                                }
                                disabled={savingId === allocation._id}
                                onClick={() =>
                                  updateAllocation(
                                    allocation,
                                    allocation.status === "active"
                                      ? "paused"
                                      : "active"
                                  )
                                }
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/30 text-amber-600 hover:bg-amber-50 disabled:opacity-40"
                              >
                                {allocation.status === "active" ? (
                                  <CirclePause className="h-4 w-4" />
                                ) : (
                                  <CirclePlay className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                title={
                                  allocation.payinStatus === "active"
                                    ? "Pause pay-in"
                                    : "Resume pay-in"
                                }
                                disabled={savingId === allocation._id}
                                onClick={() =>
                                  updateAllocation(
                                    allocation,
                                    allocation.payinStatus === "active"
                                      ? "paused"
                                      : "active",
                                    "payinStatus"
                                  )
                                }
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-300 px-3 text-xs font-black text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                              >
                                {allocation.payinStatus === "active" ? "Pause PI" : "Resume PI"}
                              </button>
                              <button
                                type="button"
                                title={
                                  allocation.payoutStatus === "active"
                                    ? "Pause payout"
                                    : "Resume payout"
                                }
                                disabled={savingId === allocation._id}
                                onClick={() =>
                                  updateAllocation(
                                    allocation,
                                    allocation.payoutStatus === "active"
                                      ? "paused"
                                      : "active",
                                    "payoutStatus"
                                  )
                                }
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-violet-400/30 px-3 text-xs font-black text-violet-300 hover:bg-violet-400/10 disabled:opacity-40"
                              >
                                {allocation.payoutStatus === "active" ? "Pause PO" : "Resume PO"}
                              </button>
                              <button
                                type="button"
                                title="Remove gateway"
                                disabled={savingId === allocation._id}
                                onClick={() => removeAllocation(allocation)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
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

      {assigningMerchant ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-gateway-title"
        >
          <form
            onSubmit={createAssignment}
            className="w-full max-w-lg rounded-xl border border-gray-200 bg-gray-50 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  {assigningMerchant.businessName}
                </p>
                <h2
                  id="assign-gateway-title"
                  className="mt-1 text-2xl font-black"
                >
                  Assign payment gateway
                </h2>
              </div>
              <button
                type="button"
                title="Close"
                onClick={() => setAssigningMerchant(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">
                  Payment gateway
                </span>
                <select
                  value={gatewayFilter}
                  onChange={(event) => {
                    setGatewayFilter(event.target.value);
                    setAssignment({ ...assignment, midPoolId: "" });
                  }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                >
                  <option value="all">All active PG / MID pools</option>
                  {gatewayOptions.map((gateway) => (
                    <option key={gateway} value={gateway}>
                      {gateway}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">
                  Gateway MID pool
                </span>
                <select
                  value={assignment.midPoolId}
                  onChange={(event) =>
                    setAssignment({
                      ...assignment,
                      midPoolId: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Select gateway and MID</option>
                  {filteredMidPools.map((pool) => (
                    <option key={pool._id} value={pool._id}>
                      {pool.gatewayName} · {pool.midName} · {pool.midId}
                    </option>
                  ))}
                </select>
                {filteredMidPools.length === 0 ? (
                  <span className="mt-2 block text-xs text-amber-600">
                    No active MID pool exists for this PG yet. Create one from MID pools.
                  </span>
                ) : null}
                {selectedPool ? (
                  <span className="mt-2 block text-xs text-gray-600">
                    Pool availability: {money(selectedPool.remainingLimit)} · Pay-in {selectedPool.payinStatus} · Payout {selectedPool.payoutStatus}
                  </span>
                ) : null}
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-700">
                    Merchant limit
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={selectedPool?.totalLimit}
                    value={assignment.merchantLimit}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        merchantLimit: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-700">
                    Commission %
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={assignment.commissionPercent}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        commissionPercent: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-700">
                    Merchant pay-in
                  </span>
                  <select
                    value={assignment.payinStatus}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        payinStatus: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                  >
                    <option value="active">Pay-in active</option>
                    <option value="paused">Pay-in paused</option>
                    <option value="blocked">Pay-in blocked</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-700">
                    Merchant payout
                  </span>
                  <select
                    value={assignment.payoutStatus}
                    onChange={(event) =>
                      setAssignment({
                        ...assignment,
                        payoutStatus: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                  >
                    <option value="active">Payout active</option>
                    <option value="paused">Payout paused</option>
                    <option value="blocked">Payout blocked</option>
                  </select>
                </label>
              </div>

              <button
                disabled={savingId === `assign-${assigningMerchant._id}`}
                className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-black text-gray-900 hover:bg-blue-700 disabled:opacity-50"
              >
                {savingId === `assign-${assigningMerchant._id}`
                  ? "Assigning..."
                  : "Assign gateway"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

