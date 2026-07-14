"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  Banknote,
  CheckCircle2,
  CreditCard,
  Plus,
  Save,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";

type PayoutAccount = {
  accountId: string;
  label: string;
  accountType: "bank" | "upi";
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  upiId: string;
  beneficiaryMobile: string;
  isPrimary: boolean;
  status: string;
  createdAt?: string;
};

const emptyForm = {
  label: "",
  accountType: "bank" as "bank" | "upi",
  beneficiaryName: "",
  accountNumber: "",
  ifsc: "",
  bankName: "",
  upiId: "",
  beneficiaryMobile: "",
  isPrimary: false,
};

function maskAccount(value: string) {
  if (!value) return "-";
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export default function MerchantBankAccountsPage() {
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const primary = useMemo(() => accounts.find((account) => account.isPrimary), [accounts]);

  async function loadAccounts() {
    try {
      setLoading(true);
      const response = await fetch("/api/merchant/bank-accounts", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load payout accounts");
      }
      setAccounts(data.accounts || []);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to load payout accounts",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccounts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/merchant/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to save payout account");
      }
      setForm(emptyForm);
      setMessage({ tone: "success", text: "Payout account saved." });
      await loadAccounts();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to save payout account",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateAccount(accountId: string, payload: Record<string, unknown>) {
    setMessage(null);
    try {
      const response = await fetch(`/api/merchant/bank-accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update payout account");
      }
      setMessage({ tone: "success", text: data.message || "Payout account updated." });
      await loadAccounts();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to update payout account",
      });
    }
  }

  async function deleteAccount(accountId: string) {
    setMessage(null);
    try {
      const response = await fetch(`/api/merchant/bank-accounts/${accountId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to remove payout account");
      }
      setMessage({ tone: "success", text: "Payout account removed." });
      await loadAccounts();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to remove payout account",
      });
    }
  }

  return (
    <main className="merchant-page min-h-screen bg-gray-50 px-5 py-7 text-gray-900 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-600">
              Payout destinations
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Bank Account / UPI
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-600">
              Save bank accounts and UPI IDs for payout requests. The primary
              account is used to prefill wallet payout forms before direct provider submission.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">
              Primary account
            </p>
            <p className="mt-2 text-sm font-black text-gray-900">
              {primary ? primary.label : "Not configured"}
            </p>
          </div>
        </header>

        {message ? (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm font-bold ${
              message.tone === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : "border-red-400/20 bg-red-400/10 text-red-100"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <form onSubmit={submitAccount} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Plus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Add payout account</h2>
                <p className="text-sm text-gray-600">Bank transfer or UPI destination.</p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1">
              {(["bank", "upi"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateForm("accountType", type)}
                  className={`rounded-lg px-4 py-3 text-sm font-black capitalize ${
                    form.accountType === type
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  {type === "bank" ? "Bank account" : "UPI ID"}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Label" value={form.label} onChange={(value) => updateForm("label", value)} placeholder="Primary HDFC" />
              <Field label="Beneficiary name" value={form.beneficiaryName} onChange={(value) => updateForm("beneficiaryName", value)} placeholder="Account holder name" />
              <Field label="Beneficiary mobile" value={form.beneficiaryMobile} onChange={(value) => updateForm("beneficiaryMobile", value.replace(/\D/g, "").slice(0, 10))} placeholder="9876543210" />
              {form.accountType === "bank" ? (
                <>
                  <Field label="Bank name" value={form.bankName} onChange={(value) => updateForm("bankName", value)} placeholder="HDFC Bank" />
                  <Field label="Account number" value={form.accountNumber} onChange={(value) => updateForm("accountNumber", value.replace(/\D/g, ""))} placeholder="123456789012" />
                  <Field label="IFSC" value={form.ifsc} onChange={(value) => updateForm("ifsc", value.toUpperCase())} placeholder="HDFC0001234" />
                </>
              ) : (
                <Field label="UPI ID" value={form.upiId} onChange={(value) => updateForm("upiId", value)} placeholder="merchant@upi" />
              )}
            </div>

            <label className="mt-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-700">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(event) => updateForm("isPrimary", event.target.checked)}
                className="h-4 w-4"
              />
              Make this the primary payout account
            </label>

            <button
              disabled={saving}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save payout account"}
            </button>
          </form>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-black">Saved payout accounts</h2>
                <p className="text-sm text-gray-600">Used by wallet payout requests for direct provider submission.</p>
              </div>
              <span className="rounded bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700">
                {accounts.length} saved
              </span>
            </div>

            {loading ? (
              <p className="py-10 text-gray-600">Loading payout accounts...</p>
            ) : accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                <Banknote className="mx-auto h-9 w-9 text-gray-400" />
                <h3 className="mt-4 text-lg font-black">No payout account saved</h3>
                <p className="mt-2 text-sm text-gray-600">Add a bank account or UPI ID to speed up payout requests.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {accounts.map((account) => (
                  <article key={account.accountId} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div className="flex min-w-0 gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          {account.accountType === "bank" ? <CreditCard className="h-5 w-5" /> : <BadgeIndianRupee className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black text-gray-900">{account.label}</h3>
                            {account.isPrimary ? (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Primary
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm font-bold text-gray-700">{account.beneficiaryName}</p>
                          <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                            <Info label="Type" value={account.accountType === "bank" ? "Bank transfer" : "UPI"} />
                            <Info label={account.accountType === "bank" ? "Account" : "UPI ID"} value={account.accountType === "bank" ? maskAccount(account.accountNumber) : account.upiId} />
                            <Info label="IFSC / Bank" value={account.accountType === "bank" ? `${account.ifsc} · ${account.bankName || "Bank"}` : "-"} />
                            <Info label="Mobile" value={account.beneficiaryMobile || "-"} />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!account.isPrimary ? (
                          <button
                            type="button"
                            onClick={() => updateAccount(account.accountId, { isPrimary: true })}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-900 hover:bg-gray-50"
                          >
                            <Star className="h-4 w-4" />
                            Primary
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => updateAccount(account.accountId, { status: account.status === "active" ? "inactive" : "active" })}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-black text-gray-900 hover:bg-gray-50"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {account.status === "active" ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAccount(account.accountId)}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-900 outline-none focus:border-blue-600"
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-gray-500">{label}:</span>{" "}
      <span className="font-bold text-gray-700">{value}</span>
    </p>
  );
}
