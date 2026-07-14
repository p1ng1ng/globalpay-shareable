"use client";

import { useEffect, useState } from "react";

type Transaction = {
  id: string;
  customer: string;
  amount: string;
  method: string;
  status: string;
  gateway: string;
  date: string;
  paymentLink?: string;
};

export default function AdminCommissionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const commissionRate = 0.25;

  useEffect(() => {
    const saved = localStorage.getItem("Wpay_transactions");
    const savedTransactions = saved ? JSON.parse(saved) : [];

    const sampleTransactions: Transaction[] = [
      {
        id: "txn_1001",
        customer: "Amit Kumar",
        amount: "₹2,499",
        method: "UPI",
        status: "Success",
        gateway: "Razorpay",
        date: "2026-06-13",
        paymentLink: "gpl_1001",
      },
      {
        id: "txn_1002",
        customer: "Neha Sharma",
        amount: "₹899",
        method: "Card",
        status: "Success",
        gateway: "Razorpay",
        date: "2026-06-12",
        paymentLink: "gpl_1002",
      },
      {
        id: "txn_1003",
        customer: "Rahul Verma",
        amount: "₹4,999",
        method: "Net Banking",
        status: "Pending",
        gateway: "Cashfree",
        date: "2026-06-11",
        paymentLink: "gpl_1003",
      },
    ];

    setTransactions([...savedTransactions, ...sampleTransactions]);
  }, []);

  function numberFromAmount(amount: string) {
    return Number(amount.replace("₹", "").replace(/,/g, ""));
  }

  function formatMoney(value: number) {
    return `₹${value.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })}`;
  }

  const successTransactions = transactions.filter((txn) => txn.status === "Success");

  const totalVolume = successTransactions.reduce(
    (sum, txn) => sum + numberFromAmount(txn.amount),
    0
  );

  const totalCommission = totalVolume * (commissionRate / 100);
  const merchantReceivable = totalVolume - totalCommission;

  const gatewayWise = ["Razorpay", "Cashfree", "Wpay Demo"].map((gateway) => {
    const gatewayTransactions = successTransactions.filter(
      (txn) => txn.gateway === gateway
    );

    const volume = gatewayTransactions.reduce(
      (sum, txn) => sum + numberFromAmount(txn.amount),
      0
    );

    return {
      gateway,
      count: gatewayTransactions.length,
      volume,
      commission: volume * (commissionRate / 100),
    };
  });

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div>
        <a href="/admin/dashboard" className="text-sm font-semibold text-blue-600">
          ← Back to Dashboard
        </a>

        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          Commissions
        </h1>

        <p className="mt-1 text-gray-500">
          Track Wpay commission income from successful transactions.
        </p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Payment Volume</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            {formatMoney(totalVolume)}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Commission Rate</p>
          <h2 className="mt-2 text-2xl font-bold text-blue-700">
            {commissionRate}%
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Commission</p>
          <h2 className="mt-2 text-2xl font-bold text-green-700">
            {formatMoney(totalCommission)}
          </h2>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Merchant Receivable</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            {formatMoney(merchantReceivable)}
          </h2>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-5">
            Gateway-wise Commission
          </h2>

          <div className="space-y-4">
            {gatewayWise.map((item) => (
              <div
                key={item.gateway}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{item.gateway}</p>
                    <p className="text-sm text-gray-500">
                      {item.count} successful transaction(s)
                    </p>
                  </div>

                  <p className="font-bold text-green-700">
                    {formatMoney(item.commission)}
                  </p>
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  Volume: <b>{formatMoney(item.volume)}</b>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-5">
            Commission Rules
          </h2>

          <div className="space-y-4 text-sm text-slate-700">
            <div className="rounded-xl bg-blue-50 p-4">
              <b>Default Rule:</b> Wpay earns {commissionRate}% on every
              successful payment.
            </div>

            <div className="rounded-xl bg-green-50 p-4">
              <b>Example:</b> On ₹10,000 payment, Wpay commission is ₹25.
            </div>

            <div className="rounded-xl bg-yellow-50 p-4">
              <b>Pending/Failed payments:</b> No commission is calculated until
              payment becomes successful.
            </div>

            <div className="rounded-xl bg-red-50 p-4">
              <b>Production note:</b> Final commission must be calculated on
              backend, not only in frontend.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-5">
          Transaction Commission Details
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-3">Transaction ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Gateway</th>
                <th>Status</th>
                <th>Commission</th>
                <th>Merchant Amount</th>
              </tr>
            </thead>

            <tbody>
              {transactions.map((txn) => {
                const amount = numberFromAmount(txn.amount);
                const commission =
                  txn.status === "Success" ? amount * (commissionRate / 100) : 0;
                const merchantAmount =
                  txn.status === "Success" ? amount - commission : 0;

                return (
                  <tr key={txn.id} className="border-b last:border-0">
                    <td className="py-4 font-semibold text-slate-900">{txn.id}</td>
                    <td className="py-4 text-slate-700">{txn.customer}</td>
                    <td className="py-4 font-bold text-slate-900">{txn.amount}</td>
                    <td className="py-4 text-slate-700">{txn.gateway}</td>
                    <td className="py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          txn.status === "Success"
                            ? "bg-green-100 text-green-700"
                            : txn.status === "Pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="py-4 font-semibold text-green-700">
                      {formatMoney(commission)}
                    </td>
                    <td className="py-4 font-semibold text-slate-900">
                      {formatMoney(merchantAmount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {transactions.length === 0 && (
            <p className="py-8 text-center text-gray-500">
              No transactions found.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

