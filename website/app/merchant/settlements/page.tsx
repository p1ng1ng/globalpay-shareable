"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLoggedInMerchantEmail } from "@/lib/getMerchantEmailClient";

type Settlement = {
  _id: string;
  settlementId: string;
  merchantEmail: string;
  totalSuccessAmount: number;
  totalRefundedAmount: number;
  totalChargebackLostAmount: number;
  platformFee: number;
  netSettlementAmount: number;
  currency: string;
  status: string;
  note: string;
  paidAt: string | null;
  createdAt: string;
};

export default function MerchantSettlementsPage() {
  const [merchantEmail, setMerchantEmail] = useState("");
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadSettlements(email: string) {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        `/api/settlements?merchantEmail=${encodeURIComponent(email)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (data.success) {
        setSettlements(data.settlements || []);
      } else {
        setMessage(data.message || "Failed to load settlements.");
      }
    } catch {
      setMessage("Something went wrong while loading settlements.");
    } finally {
      setLoading(false);
    }
  }

  async function initializePage() {
    try {
      const email = await getLoggedInMerchantEmail();
      setMerchantEmail(email);
      await loadSettlements(email);
    } catch {
      setMessage("Please login again as merchant.");
      setLoading(false);
    }
  }

  useEffect(() => {
    initializePage();
  }, []);

  const pendingSettlements = settlements.filter(
    (settlement) => settlement.status === "pending"
  ).length;

  const processingSettlements = settlements.filter(
    (settlement) => settlement.status === "processing"
  ).length;

  const paidSettlements = settlements.filter(
    (settlement) => settlement.status === "paid"
  ).length;

  const totalNetAmount = settlements.reduce((sum, settlement) => {
    return sum + Number(settlement.netSettlementAmount || 0);
  }, 0);

  const paidAmount = settlements.reduce((sum, settlement) => {
    if (settlement.status === "paid") {
      return sum + Number(settlement.netSettlementAmount || 0);
    }

    return sum;
  }, 0);

  const pendingAmount = settlements.reduce((sum, settlement) => {
    if (settlement.status !== "paid") {
      return sum + Number(settlement.netSettlementAmount || 0);
    }

    return sum;
  }, 0);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">
              Wpay Merchant
            </p>
            <h1 className="text-4xl font-black">Settlements</h1>
            <p className="mt-2 text-slate-400">
              Logged in merchant:{" "}
              <span className="font-bold text-white">
                {merchantEmail || "Loading..."}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => merchantEmail && loadSettlements(merchantEmail)}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Refresh
            </button>

            <Link
              href="/merchant/dashboard"
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold hover:bg-white/10"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Total Settlements</p>
            <p className="mt-2 text-3xl font-black">{settlements.length}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Pending</p>
            <p className="mt-2 text-3xl font-black text-amber-300">
              {pendingSettlements}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Processing</p>
            <p className="mt-2 text-3xl font-black text-blue-300">
              {processingSettlements}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Paid</p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              {paidSettlements}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Paid Amount</p>
            <p className="mt-2 text-3xl font-black">INR {paidAmount}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Total Net Settlement</p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              INR {totalNetAmount}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Pending Payable</p>
            <p className="mt-2 text-3xl font-black text-amber-300">
              INR {pendingAmount}
            </p>
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">Your Settlement Records</h2>
            <p className="mt-1 text-sm text-slate-400">
              Settlements are generated and marked paid by admin.
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-slate-300">Loading settlements...</div>
          ) : settlements.length === 0 ? (
            <div className="p-8 text-slate-300">
              No settlements found. Admin needs to generate settlement first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1350px] text-left text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="px-5 py-4">Settlement</th>
                    <th className="px-5 py-4">Success</th>
                    <th className="px-5 py-4">Refunded</th>
                    <th className="px-5 py-4">Chargeback Lost</th>
                    <th className="px-5 py-4">Fee</th>
                    <th className="px-5 py-4">Net Payable</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Paid At</th>
                    <th className="px-5 py-4">Note</th>
                  </tr>
                </thead>

                <tbody>
                  {settlements.map((settlement) => (
                    <tr key={settlement._id} className="border-t border-white/10">
                      <td className="px-5 py-4">
                        <p className="font-bold">{settlement.settlementId}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {new Date(settlement.createdAt).toLocaleString()}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-bold">
                        {settlement.currency} {settlement.totalSuccessAmount}
                      </td>

                      <td className="px-5 py-4 font-bold text-red-300">
                        {settlement.currency} {settlement.totalRefundedAmount}
                      </td>

                      <td className="px-5 py-4 font-bold text-orange-300">
                        {settlement.currency} {settlement.totalChargebackLostAmount || 0}
                      </td>

                      <td className="px-5 py-4 font-bold text-amber-300">
                        {settlement.currency} {settlement.platformFee}
                      </td>

                      <td className="px-5 py-4 text-lg font-black text-emerald-300">
                        {settlement.currency} {settlement.netSettlementAmount}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            settlement.status === "paid"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : settlement.status === "processing"
                                ? "bg-blue-400/10 text-blue-300"
                                : "bg-amber-400/10 text-amber-300"
                          }`}
                        >
                          {settlement.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-400">
                        {settlement.paidAt
                          ? new Date(settlement.paidAt).toLocaleString()
                          : "Not paid yet"}
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {settlement.note || "No note"}
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
