"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, RefreshCcw } from "lucide-react";
import { getLoggedInMerchantEmail } from "@/lib/getMerchantEmailClient";

type PaymentLink = {
  _id: string;
  linkId: string;
  merchantEmail: string;
  title: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
};

type FormState = {
  merchantEmail: string;
  title: string;
  customerName: string;
  customerEmail: string;
  amount: string;
  currency: string;
  merchantMidAllocationId: string;
};

type MerchantMid = {
  allocationId: string;
  label: string;
  status: string;
};

export default function MerchantPaymentLinksPage() {
  const [form, setForm] = useState<FormState>({
    merchantEmail: "",
    title: "",
    customerName: "",
    customerEmail: "",
    amount: "",
    currency: "INR",
    merchantMidAllocationId: "",
  });

  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [assignedMids, setAssignedMids] = useState<MerchantMid[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPaymentLinks(email: string) {
    try {
      setLoading(true);

      const response = await fetch(
        `/api/payment-links?merchantEmail=${encodeURIComponent(email)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (data.success) {
        setPaymentLinks(data.paymentLinks || []);
      }
    } catch {
      setMessage("Failed to load payment links.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAssignedMids() {
    const response = await fetch("/api/merchant/mid-allocations", {
      credentials: "include",
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok && data.success) {
      setAssignedMids(data.mids || []);
    }
  }

  async function initializePage() {
    try {
      const email = await getLoggedInMerchantEmail();

      setForm((current) => ({
        ...current,
        merchantEmail: email,
      }));

      await Promise.all([loadPaymentLinks(email), loadAssignedMids()]);
    } catch {
      setMessage("Please login again as merchant.");
      setLoading(false);
    }
  }

  async function createPaymentLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.merchantEmail) {
      setMessage("Merchant email not loaded. Please login again.");
      return;
    }

    setCreating(true);
    setMessage("");

    try {
      const response = await fetch("/api/payment-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantEmail: form.merchantEmail,
          title: form.title,
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          amount: Number(form.amount),
          currency: form.currency,
          merchantMidAllocationId: form.merchantMidAllocationId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to create payment link");
        return;
      }

      setMessage("Payment link created successfully.");

      setForm((current) => ({
        merchantEmail: current.merchantEmail,
        title: "",
        customerName: "",
        customerEmail: "",
        amount: "",
        currency: "INR",
        merchantMidAllocationId: current.merchantMidAllocationId,
      }));

      await loadPaymentLinks(form.merchantEmail);
    } catch {
      setMessage("Something went wrong while creating payment link.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    initializePage();
  }, []);

  const activeLinks = paymentLinks.filter((link) => link.status === "active").length;
  const paidLinks = paymentLinks.filter((link) => link.status === "paid").length;
  const midTestingEnabled = assignedMids.length > 1;

  return (
    <main className="merchant-page min-h-screen bg-[#050917] px-5 py-7 text-white md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-black uppercase tracking-[0.22em] text-emerald-300">
              Collections and hosted pay-ins
            </p>
            <h1 className="text-4xl font-black tracking-tight">Payment Links</h1>
            <p className="mt-3 text-sm text-slate-400">
              Logged in merchant:{" "}
              <span className="font-black text-white">
                {form.merchantEmail || "Loading..."}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => form.merchantEmail && loadPaymentLinks(form.merchantEmail)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>

            <Link
              href="/merchant/dashboard"
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-black hover:bg-white/10"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5">
            <p className="text-sm font-bold text-slate-400">Total Links</p>
            <p className="mt-2 text-3xl font-black">{paymentLinks.length}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5">
            <p className="text-sm font-bold text-slate-400">Active</p>
            <p className="mt-2 text-3xl font-black text-blue-300">{activeLinks}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5">
            <p className="text-sm font-bold text-slate-400">Paid</p>
            <p className="mt-2 text-3xl font-black text-emerald-300">{paidLinks}</p>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#111827]/80 p-6">
          <h2 className="text-2xl font-black">Create Payment Link</h2>
          <p className="mt-2 text-sm text-slate-400">
            This link will be created under your logged-in merchant account.
          </p>

          <form onSubmit={createPaymentLink} className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Merchant Email
              </label>
              <input
                value={form.merchantEmail}
                readOnly
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-slate-400 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Payment Title
              </label>
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Example: Website Design Advance"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Customer Name
              </label>
              <input
                value={form.customerName}
                onChange={(event) =>
                  setForm({ ...form, customerName: event.target.value })
                }
                placeholder="Customer name"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Customer Email
              </label>
              <input
                type="email"
                value={form.customerEmail}
                onChange={(event) =>
                  setForm({ ...form, customerEmail: event.target.value })
                }
                placeholder="customer@example.com"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Amount
              </label>
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="1000"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Currency
              </label>
              <select
                value={form.currency}
                onChange={(event) => setForm({ ...form, currency: event.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-slate-300">
                Merchant MID selection
              </label>
              <select
                value={form.merchantMidAllocationId}
                onChange={(event) =>
                  setForm({ ...form, merchantMidAllocationId: event.target.value })
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
              >
                <option value="">Auto route using assigned rules</option>
                {assignedMids.map((mid) => (
                  <option key={mid.allocationId} value={mid.allocationId}>
                    {mid.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {midTestingEnabled
                  ? "For testing, you can force one of your assigned merchant MID labels. Upstream gateway names stay hidden."
                  : "When only one MID label is assigned, routing stays automatic."}
              </p>
            </div>

            <button
              type="submit"
              disabled={creating || !form.merchantEmail}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-60 md:col-span-2"
            >
              {creating ? "Creating..." : "Create Payment Link"}
            </button>
          </form>

          {message ? (
            <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm font-semibold text-blue-100">
              {message}
            </div>
          ) : null}
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[#111827]/80">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-xl font-black">Your Payment Links</h2>
          </div>

          {loading ? (
            <div className="p-8 text-slate-300">Loading payment links...</div>
          ) : paymentLinks.length === 0 ? (
            <div className="p-8 text-slate-300">No payment links found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-[#0b1220] text-slate-300">
                  <tr>
                    <th className="px-5 py-4">Link</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Title</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">MID Label</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Open</th>
                  </tr>
                </thead>

                <tbody>
                  {paymentLinks.map((link) => (
                    <tr key={link._id} className="border-t border-white/10">
                      <td className="px-5 py-4">
                        <p className="font-bold">{link.linkId}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(link.createdAt).toLocaleString()}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        <p>{link.customerName}</p>
                        <p className="text-xs text-slate-400">{link.customerEmail}</p>
                      </td>

                      <td className="px-5 py-4 text-slate-300">{link.title}</td>

                      <td className="px-5 py-4 font-bold">
                        {link.currency} {link.amount}
                      </td>

                      <td className="px-5 py-4 text-slate-300">
                        {(link as PaymentLink & { merchantMidLabel?: string }).merchantMidLabel || "Auto"}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            link.status === "paid"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : link.status === "active"
                                ? "bg-blue-400/10 text-blue-300"
                                : "bg-amber-400/10 text-amber-300"
                          }`}
                        >
                          {link.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/pay/${link.linkId}`}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-500"
                          >
                            Open Link
                          </Link>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/pay/${link.linkId}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-slate-200 hover:bg-white/5"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
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
