"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLoggedInMerchantEmail } from "@/lib/getMerchantEmailClient";

type Transaction = {
  _id: string;
  transactionId: string;
  paymentLinkId: string;
  merchantEmail: string;
  customerName: string;
  customerEmail: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string;
};

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
  processedAt: string | null;
  createdAt: string;
};

export default function MerchantRefundsPage() {
  const [merchantEmail, setMerchantEmail] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function loadData(email: string) {
    try {
      setLoading(true);
      setMessage("");

      const [transactionsResponse, refundsResponse] = await Promise.all([
        fetch(`/api/transactions?merchantEmail=${encodeURIComponent(email)}`, {
          cache: "no-store",
        }),
        fetch(`/api/refunds?merchantEmail=${encodeURIComponent(email)}`, {
          cache: "no-store",
        }),
      ]);

      const transactionsData = await transactionsResponse.json();
      const refundsData = await refundsResponse.json();

      if (transactionsData.success) {
        setTransactions(transactionsData.transactions || []);
      }

      if (refundsData.success) {
        setRefunds(refundsData.refunds || []);
      }
    } catch {
      setMessage("Failed to load refund data.");
    } finally {
      setLoading(false);
    }
  }

  async function initializePage() {
    try {
      const email = await getLoggedInMerchantEmail();
      setMerchantEmail(email);
      await loadData(email);
    } catch {
      setMessage("Please login again as merchant.");
      setLoading(false);
    }
  }

  async function createRefund(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!merchantEmail) {
      setMessage("Merchant email not loaded. Please login again.");
      return;
    }

    if (!selectedTransactionId) {
      setMessage("Please select a transaction.");
      return;
    }

    setCreating(true);
    setMessage("");

    try {
      const response = await fetch("/api/refunds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId: selectedTransactionId,
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to create refund request.");
        return;
      }

      setMessage("Refund request created successfully.");
      setSelectedTransactionId("");
      setReason("");
      await loadData(merchantEmail);
    } catch {
      setMessage("Something went wrong while creating refund request.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    initializePage();
  }, []);

  const refundableTransactions = transactions.filter(
    (transaction) => transaction.status === "success"
  );

  const pendingRefunds = refunds.filter((refund) => refund.status === "pending").length;
  const approvedRefunds = refunds.filter((refund) => refund.status === "approved").length;
  const rejectedRefunds = refunds.filter((refund) => refund.status === "rejected").length;

  const totalRefundAmount = refunds
    .filter((refund) => refund.status === "approved")
    .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">
              Wpay Merchant
            </p>
            <h1 className="text-4xl font-black">Refunds</h1>
            <p className="mt-2 text-slate-400">
              Logged in merchant:{" "}
              <span className="font-bold text-white">
                {merchantEmail || "Loading..."}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => merchantEmail && loadData(merchantEmail)}
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
          <div className="mb-6 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Total Refunds</p>
            <p className="mt-2 text-3xl font-black">{refunds.length}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Pending</p>
            <p className="mt-2 text-3xl font-black text-amber-300">
              {pendingRefunds}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Approved</p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              {approvedRefunds}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Refunded Amount</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              INR {totalRefundAmount}
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-black">Request Refund</h2>
          <p className="mt-2 text-sm text-slate-400">
            Select one successful transaction and submit a refund request to admin.
          </p>

          <form onSubmit={createRefund} className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Transaction
              </label>
              <select
                value={selectedTransactionId}
                onChange={(event) => setSelectedTransactionId(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              >
                <option value="">Select transaction</option>
                {refundableTransactions.map((transaction) => (
                  <option
                    key={transaction._id}
                    value={transaction.transactionId}
                  >
                    {transaction.transactionId} — {transaction.currency}{" "}
                    {transaction.amount} — {transaction.customerName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Reason
              </label>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Example: Customer requested refund"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={creating || !merchantEmail}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700 disabled:opacity-60 md:col-span-2"
            >
              {creating ? "Submitting..." : "Submit Refund Request"}
            </button>
          </form>
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">Your Refund Requests</h2>
          </div>

          {loading ? (
            <div className="p-8 text-slate-300">Loading refunds...</div>
          ) : refunds.length === 0 ? (
            <div className="p-8 text-slate-300">No refund requests found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-left text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="px-5 py-4">Refund</th>
                    <th className="px-5 py-4">Transaction</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Reason</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Admin Note</th>
                  </tr>
                </thead>

                <tbody>
                  {refunds.map((refund) => (
                    <tr key={refund._id} className="border-t border-white/10">
                      <td className="px-5 py-4">
                        <p className="font-bold">{refund.refundId}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(refund.createdAt).toLocaleString()}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {refund.transactionId}
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        <p>{refund.customerName}</p>
                        <p className="text-xs text-slate-400">
                          {refund.customerEmail}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-bold">
                        {refund.currency} {refund.amount}
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {refund.reason}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            refund.status === "approved"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : refund.status === "rejected"
                                ? "bg-red-400/10 text-red-300"
                                : "bg-amber-400/10 text-amber-300"
                          }`}
                        >
                          {refund.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {refund.adminNote || "No note yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rejectedRefunds > 0 ? (
            <div className="border-t border-white/10 p-5 text-sm text-red-200">
              Rejected refund requests: {rejectedRefunds}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
