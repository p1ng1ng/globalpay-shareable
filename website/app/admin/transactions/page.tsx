"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTransactions() {
    try {
      setLoading(true);

      const response = await fetch("/api/transactions", {
        cache: "no-store",
      });

      const data = await response.json();

      if (data.success) {
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransactions();
  }, []);

  const successVolume = transactions.reduce((sum, transaction) => {
    if (transaction.status === "success") {
      return sum + transaction.amount;
    }
    return sum;
  }, 0);

  const failedVolume = transactions.reduce((sum, transaction) => {
    if (transaction.status === "failed") {
      return sum + transaction.amount;
    }
    return sum;
  }, 0);

  const successfulTransactions = transactions.filter(
    (transaction) => transaction.status === "success"
  ).length;

  const failedTransactions = transactions.filter(
    (transaction) => transaction.status === "failed"
  ).length;

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-600">
              Wpay Admin
            </p>
            <h1 className="text-4xl font-black">All Transactions</h1>
            <p className="mt-2 text-gray-600">
              All merchant payments loaded from PostgreSQL.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadTransactions}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Refresh
            </button>

            <Link
              href="/admin/merchants"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Merchants
            </Link>

            <Link
              href="/admin/dashboard"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Total Transactions</p>
            <p className="mt-2 text-3xl font-black">{transactions.length}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Successful</p>
            <p className="mt-2 text-3xl font-black">{successfulTransactions}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Failed</p>
            <p className="mt-2 text-3xl font-black">{failedTransactions}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Success Amount</p>
            <p className="mt-2 text-3xl font-black">INR {successVolume}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Failed Amount</p>
            <p className="mt-2 text-3xl font-black">INR {failedVolume}</p>
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-black">Transaction Records</h2>
            <p className="mt-1 text-sm text-gray-600">
              Admin view for all successful customer payments.
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-gray-700">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-gray-700">
              No transactions found. Create a payment link and complete a payment first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-5 py-4">Transaction</th>
                    <th className="px-5 py-4">Merchant</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Gateway</th>
                    <th className="px-5 py-4">Method</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Paid At</th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction._id} className="border-t border-gray-200">
                      <td className="px-5 py-4">
                        <p className="font-bold">{transaction.title}</p>
                        <p className="mt-1 font-mono text-xs text-gray-600">
                          {transaction.transactionId}
                        </p>
                        <p className="mt-1 font-mono text-xs text-gray-500">
                          Link: {transaction.paymentLinkId}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {transaction.merchantEmail}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        <p>{transaction.customerName || "Not added"}</p>
                        <p className="text-xs text-gray-500">
                          {transaction.customerEmail || "No email"}
                        </p>
                      </td>

                      <td className="px-5 py-4 font-black">
                        {transaction.currency} {transaction.amount}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {transaction.gateway}
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {transaction.paymentMethod}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            transaction.status === "success"
                              ? "bg-emerald-100 text-emerald-600"
                              : transaction.status === "refunded"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-red-50 text-red-600"
                          }`}
                        >
                          {transaction.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {new Date(transaction.paidAt).toLocaleString()}
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

