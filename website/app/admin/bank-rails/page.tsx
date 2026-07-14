"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Landmark, Plus, RefreshCw, Save } from "lucide-react";

type BankRail = {
  _id: string;
  railId: string;
  bankName: string;
  accountLabel: string;
  upiId: string;
  payeeName: string;
  status: string;
  payinStatus: string;
  minAmount: number;
  maxAmount: number;
  dailyLimit: number;
  monthlyLimit: number;
  assignedMerchants?: number;
};

const emptyForm = {
  bankName: "",
  accountLabel: "",
  accountHolderName: "",
  upiId: "",
  payeeName: "",
  minAmount: "1",
  maxAmount: "100000",
  dailyLimit: "0",
  monthlyLimit: "0",
  status: "active",
  payinStatus: "active",
};

export default function AdminBankRailsPage() {
  const [rails, setRails] = useState<BankRail[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadRails() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/bank-rails", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load bank rails");
      }
      setRails(data.rails || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load bank rails");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRails();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateForm(key: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveRail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/bank-rails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          minAmount: Number(form.minAmount),
          maxAmount: Number(form.maxAmount),
          dailyLimit: Number(form.dailyLimit),
          monthlyLimit: Number(form.monthlyLimit),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to save bank rail");
      }
      setForm(emptyForm);
      setMessage("Bank rail saved.");
      await loadRails();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save bank rail");
    } finally {
      setSaving(false);
    }
  }

  async function updateRail(rail: BankRail, payload: Record<string, unknown>) {
    setMessage("");
    const response = await fetch(`/api/admin/bank-rails/${rail.railId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setMessage(data.message || (response.ok ? "Rail updated" : "Update failed"));
    await loadRails();
  }

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-600">
              Internal collection rails
            </p>
            <h1 className="mt-3 text-4xl font-black">Bank / UPI Rails</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              Manage Wpay-controlled UPI IDs used for direct bank rail pay-ins.
            </p>
          </div>
          <button
            onClick={loadRails}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </header>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <form onSubmit={saveRail} className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <Plus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Add rail</h2>
                <p className="text-sm text-gray-600">UPI collection account details.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Bank name" value={form.bankName} onChange={(v) => updateForm("bankName", v)} />
              <Field label="Account label" value={form.accountLabel} onChange={(v) => updateForm("accountLabel", v)} />
              <Field label="Payee name" value={form.payeeName} onChange={(v) => updateForm("payeeName", v)} />
              <Field label="UPI ID" value={form.upiId} onChange={(v) => updateForm("upiId", v)} />
              <Field label="Min amount" value={form.minAmount} onChange={(v) => updateForm("minAmount", v)} />
              <Field label="Max amount" value={form.maxAmount} onChange={(v) => updateForm("maxAmount", v)} />
              <Field label="Daily limit" value={form.dailyLimit} onChange={(v) => updateForm("dailyLimit", v)} />
              <Field label="Monthly limit" value={form.monthlyLimit} onChange={(v) => updateForm("monthlyLimit", v)} />
            </div>

            <button
              disabled={saving}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-gray-900 hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save rail"}
            </button>
          </form>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-xl font-black">Configured rails</h2>
            <div className="mt-5 grid gap-4">
              {loading ? (
                <p className="text-gray-600">Loading rails...</p>
              ) : rails.length === 0 ? (
                <p className="text-gray-600">No bank rails configured.</p>
              ) : (
                rails.map((rail) => (
                  <article key={rail.railId} className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Landmark className="h-4 w-4 text-emerald-600" />
                          <h3 className="font-black">{rail.accountLabel || rail.bankName}</h3>
                        </div>
                        <p className="mt-2 font-mono text-sm text-blue-700">{rail.upiId}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {rail.bankName} · {rail.payeeName} · INR {rail.minAmount} to {rail.maxAmount}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {["active", "paused", "blocked"].map((status) => (
                          <button
                            key={status}
                            onClick={() => updateRail(rail, { status, payinStatus: status })}
                            className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${
                              rail.status === status
                                ? "bg-emerald-500 text-gray-900"
                                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-gray-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-emerald-400"
      />
    </label>
  );
}


