"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Refund = {
  _id: string;
  refundId: string;
  transactionId: string;
  merchantEmail: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  adminNote: string;
  createdAt: string;
};

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [adminNote, setAdminNote] = useState("Processed by admin");

  async function loadRefunds() {
    try {
      setLoading(true);

      const response = await fetch("/api/refunds", {
        cache: "no-store",
      });

      const data = await response.json();

      if (data.success) {
        setRefunds(data.refunds || []);
      }
    } catch (error) {
      console.error("Failed to load refunds:", error);
    } finally {
      setLoading(false);
    }
  }

  async function updateRefund(refundId: string, status: "approved" | "rejected") {
    try {
      setSavingId(refundId);

      const response = await fetch(`/api/refunds/${refundId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          adminNote,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || "Failed to update refund");
        return;
      }

      await loadRefunds();
    } catch {
      alert("Something went wrong while updating refund.");
    } finally {
      setSavingId("");
    }
  }

  useEffect(() => {
    loadRefunds();
  }, []);

  const pendingRefunds = refunds.filter((refund) => refund.status === "pending").length;
  const approvedRefunds = refunds.filter((refund) => refund.status === "approved").length;
  const rejectedRefunds = refunds.filter((refund) => refund.status === "rejected").length;

  const approvedAmount = refunds.reduce((sum, refund) => {
    if (refund.status === "approved") {
      return sum + refund.amount;
    }
    return sum;
  }, 0);

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-600">
              Wpay Admin
            </p>
            <h1 className="text-4xl font-black">Refund Requests</h1>
            <p className="mt-2 text-gray-600">
              Approve or reject merchant refund requests from PostgreSQL.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadRefunds}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Refresh
            </button>

            <Link
              href="/admin/transactions"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Transactions
            </Link>

            <Link
              href="/admin/dashboard"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Total Refunds</p>
            <p className="mt-2 text-3xl font-black">{refunds.length}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Pending</p>
            <p className="mt-2 text-3xl font-black text-amber-600">{pendingRefunds}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Approved</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">{approvedRefunds}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Approved Amount</p>
            <p className="mt-2 text-3xl font-black">INR {approvedAmount}</p>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-5">
          <label className="mb-2 block text-sm font-bold text-gray-700">
            Admin Note
          </label>
          <input
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
          />
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-black">Refund Records</h2>
            <p className="mt-1 text-sm text-gray-600">
              Approved refunds will also mark the original transaction as refunded.
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-gray-700">Loading refunds...</div>
          ) : refunds.length === 0 ? (
            <div className="p-8 text-gray-700">
              No refund requests found. Create a refund from merchant refunds page first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-5 py-4">Refund</th>
                    <th className="px-5 py-4">Merchant</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Reason</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {refunds.map((refund) => (
                    <tr key={refund._id} className="border-t border-gray-200">
                      <td className="px-5 py-4">
                        <p className="font-bold">{refund.refundId}</p>
                        <p className="mt-1 font-mono text-xs text-gray-600">
                          Txn: {refund.transactionId}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {refund.merchantEmail}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        <p>{refund.customerName || "Not added"}</p>
                        <p className="text-xs text-gray-500">
                          {refund.customerEmail || "No email"}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-black">
                        {refund.currency} {refund.amount}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        <p>{refund.reason}</p>
                        {refund.adminNote ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Note: {refund.adminNote}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            refund.status === "approved"
                              ? "bg-emerald-100 text-emerald-600"
                              : refund.status === "rejected"
                                ? "bg-red-50 text-red-600"
                                : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {refund.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={savingId === refund.refundId || refund.status !== "pending"}
                            onClick={() => updateRefund(refund.refundId, "approved")}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Approve
                          </button>

                          <button
                            disabled={savingId === refund.refundId || refund.status !== "pending"}
                            onClick={() => updateRefund(refund.refundId, "rejected")}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>

                        {savingId === refund.refundId ? (
                          <p className="mt-2 text-xs text-blue-600">Saving...</p>
                        ) : null}
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

