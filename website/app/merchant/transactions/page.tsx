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
  paymentMethod: string;
  gateway: string;
  status: string;
  paidAt: string;
  createdAt: string;
};

export default function MerchantTransactionsPage() {
  const [merchantEmail, setMerchantEmail] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  async function resendCallback(transactionId: string) {
    setResendingId(transactionId);
    try {
      const res = await fetch("/api/merchant/webhooks/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      const data = await res.json();
      setResendResult((prev) => ({
        ...prev,
        [transactionId]: { ok: data.success, msg: data.message || (data.success ? "Delivered" : "Failed") },
      }));
    } catch {
      setResendResult((prev) => ({
        ...prev,
        [transactionId]: { ok: false, msg: "Network error" },
      }));
    } finally {
      setResendingId(null);
    }
  }

  async function loadTransactions(email: string) {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        `/api/transactions?merchantEmail=${encodeURIComponent(email)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (data.success) {
        setTransactions(data.transactions || []);
      } else {
        setMessage(data.message || "Failed to load transactions.");
      }
    } catch {
      setMessage("Something went wrong while loading transactions.");
    } finally {
      setLoading(false);
    }
  }

  async function initializePage() {
    try {
      const email = await getLoggedInMerchantEmail();
      setMerchantEmail(email);
      await loadTransactions(email);
    } catch {
      setMessage("Please login again as merchant.");
      setLoading(false);
    }
  }

  useEffect(() => {
    initializePage();
  }, []);

  const successTransactions = transactions.filter(
    (transaction) => transaction.status === "success"
  );

  const refundedTransactions = transactions.filter(
    (transaction) => transaction.status === "refunded"
  );

  const totalSuccessAmount = successTransactions.reduce((sum, transaction) => {
    return sum + Number(transaction.amount || 0);
  }, 0);

  const totalRefundedAmount = refundedTransactions.reduce((sum, transaction) => {
    return sum + Number(transaction.amount || 0);
  }, 0);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">
              Wpay Merchant
            </p>
            <h1 className="text-4xl font-black">Transactions</h1>
            <p className="mt-2 text-slate-400">
              Logged in merchant:{" "}
              <span className="font-bold text-white">
                {merchantEmail || "Loading..."}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => merchantEmail && loadTransactions(merchantEmail)}
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

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Total Transactions</p>
            <p className="mt-2 text-3xl font-black">{transactions.length}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Successful</p>
            <p className="mt-2 text-3xl font-black text-emerald-300">
              {successTransactions.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Success Volume</p>
            <p className="mt-2 text-3xl font-black">INR {totalSuccessAmount}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-400">Refunded</p>
            <p className="mt-2 text-3xl font-black text-red-300">
              INR {totalRefundedAmount}
            </p>
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">Your Transactions</h2>
          </div>

          {loading ? (
            <div className="p-8 text-slate-300">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-slate-300">
              No transactions found for this merchant.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-left text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="px-5 py-4">Transaction</th>
                    <th className="px-5 py-4">Payment Link</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Title</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Gateway</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Callback</th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction._id} className="border-t border-white/10">
                      <td className="px-5 py-4">
                        <p className="font-bold">{transaction.transactionId}</p>
                        <p className="text-xs text-slate-400">
                          {transaction.paidAt
                            ? new Date(transaction.paidAt).toLocaleString()
                            : "No paid date"}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {transaction.paymentLinkId}
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        <p>{transaction.customerName}</p>
                        <p className="text-xs text-slate-400">
                          {transaction.customerEmail}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {transaction.title}
                      </td>

                      <td className="px-5 py-4 font-bold">
                        {transaction.currency} {transaction.amount}
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        <p>{transaction.gateway || "Wpay Gateway"}</p>
                        <p className="text-xs text-slate-400">
                          {transaction.paymentMethod || "Wpay Checkout"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            transaction.status === "success"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : transaction.status === "refunded"
                                ? "bg-red-400/10 text-red-300"
                                : "bg-amber-400/10 text-amber-300"
                          }`}
                        >
                          {transaction.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {resendResult[transaction.transactionId] ? (
                          <span className={`text-xs font-bold ${resendResult[transaction.transactionId].ok ? "text-emerald-400" : "text-red-400"}`}>
                            {resendResult[transaction.transactionId].msg}
                          </span>
                        ) : (
                          <button
                            onClick={() => resendCallback(transaction.transactionId)}
                            disabled={resendingId === transaction.transactionId}
                            className="rounded-lg bg-blue-600/20 px-3 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-600/40 disabled:opacity-50"
                          >
                            {resendingId === transaction.transactionId ? "Sending..." : "Resend Callback"}
                          </button>
                        )}
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
