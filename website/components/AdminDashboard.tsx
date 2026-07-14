"use client";

import Link from "next/link";

export default function AdminDashboard() {
  return (
    <section className="grid gap-6 md:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-slate-400">Merchants</p>
        <p className="mt-2 text-3xl font-black text-white">PostgreSQL</p>
        <Link
          href="/admin/merchants"
          className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          View Merchants
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-slate-400">Merchants</p>
        <p className="mt-2 text-3xl font-black text-white">Review</p>
        <Link
          href="/admin/merchants"
          className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          Merchant Approvals
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-slate-400">Transactions</p>
        <p className="mt-2 text-3xl font-black text-white">Live</p>
        <Link
          href="/admin/transactions"
          className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          View Transactions
        </Link>
      </div>
    </section>
  );
}
