"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, RefreshCcw, Send } from "lucide-react";
import { getLoggedInMerchantEmail } from "@/lib/getMerchantEmailClient";

type MoneySummary = {
  [key: string]: number | string | undefined;
};

type PayoutRecord = {
  payoutId: string;
  beneficiaryName: string;
  ifsc: string;
  bankName: string;
  upiId?: string;
  accountType?: string;
  amount: number;
  status: string;
  utr: string;
  createdAt?: string;
};

type PayoutAccount = {
  accountId: string;
  label: string;
  accountType?: "bank" | "upi";
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  upiId?: string;
  beneficiaryMobile: string;
  isPrimary: boolean;
  status: string;
};

const emptyForm = {
  amount: "",
  accountType: "bank",
  accountId: "",
  beneficiaryName: "",
  accountNumber: "",
  ifsc: "",
  bankName: "",
  upiId: "",
  beneficiaryMobile: "",
  note: "",
};

function money(value: unknown) {
  return `INR ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function statusClass(status: string) {
  const value = String(status || "").toLowerCase();
  if (["paid", "success", "completed"].includes(value)) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (["failed", "failure", "cancelled"].includes(value)) {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

function shortDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MerchantWalletPage() {
  const [merchantEmail, setMerchantEmail] = useState("");
  const [balance, setBalance] = useState<MoneySummary>({});
  const [summary, setSummary] = useState<MoneySummary>({});
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [primaryAccount, setPrimaryAccount] = useState<PayoutAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadWallet(email?: string) {
    try {
      setLoading(true);
      setMessage("");
      const [balanceResponse, payoutsResponse, accountsResponse] = await Promise.all([
        fetch("/api/merchant/balance", { credentials: "include", cache: "no-store" }),
        fetch("/api/merchant/payouts", { credentials: "include", cache: "no-store" }),
        fetch("/api/merchant/bank-accounts", { credentials: "include", cache: "no-store" }),
      ]);
      const [balanceData, payoutsData, accountsData] = await Promise.all([
        balanceResponse.json(),
        payoutsResponse.json(),
        accountsResponse.json(),
      ]);

      if (!balanceData.success) throw new Error(balanceData.message || "Balance failed");
      if (!payoutsData.success) throw new Error(payoutsData.message || "Payouts failed");
      if (!accountsData.success) throw new Error(accountsData.message || "Payout accounts failed");

      setBalance(balanceData.balance || {});
      setSummary(payoutsData.summary || {});
      setPayouts(payoutsData.payouts || []);
      setAccounts(accountsData.accounts || []);
      setPrimaryAccount(accountsData.primaryAccount || null);
      if (email) setMerchantEmail(email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load wallet");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getLoggedInMerchantEmail()
      .then((email) => loadWallet(email))
      .catch(() => {
        setMessage("Please login again as merchant.");
        setLoading(false);
      });
  }, []);

  const stats = useMemo(
    () => [
      { label: "Available", value: money(balance.available), tone: "text-emerald-200" },
      { label: "Successful pay-in", value: money(balance.successfulVolume), tone: "text-white" },
      { label: "Pending payout", value: money(summary.pendingAmount), tone: "text-amber-200" },
      { label: "Paid payout", value: money(summary.paidAmount), tone: "text-blue-200" },
    ],
    [balance, summary]
  );

  function updateForm(key: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function usePrimaryAccount() {
    if (!primaryAccount) return;
    setForm((current) => ({
      ...current,
      accountType: primaryAccount.accountType || "bank",
      accountId: primaryAccount.accountId || current.accountId,
      beneficiaryName: primaryAccount.beneficiaryName || current.beneficiaryName,
      accountNumber: primaryAccount.accountNumber || current.accountNumber,
      ifsc: primaryAccount.ifsc || current.ifsc,
      bankName: primaryAccount.bankName || current.bankName,
      upiId: primaryAccount.upiId || current.upiId,
      beneficiaryMobile: primaryAccount.beneficiaryMobile || current.beneficiaryMobile,
    }));
    setMessage(`Primary payout account applied: ${primaryAccount.label}`);
  }

  function applySelectedAccount(accountId: string) {
    const account = accounts.find((item) => item.accountId === accountId);
    if (!account) return;

    setForm((current) => ({
      ...current,
      accountId: account.accountId,
      accountType: account.accountType || "bank",
      beneficiaryName: account.beneficiaryName || current.beneficiaryName,
      accountNumber: account.accountNumber || "",
      ifsc: account.ifsc || "",
      bankName: account.bankName || "",
      upiId: account.upiId || "",
      beneficiaryMobile: account.beneficiaryMobile || current.beneficiaryMobile,
    }));

    setMessage(`Saved payout destination applied: ${account.label}`);
  }

  async function submitPayout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage("");
      const response = await fetch("/api/merchant/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          accountId: form.accountId,
          merchantEmail,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Payout request failed");
      setForm({ ...emptyForm, accountType: form.accountType });
      setMessage(data.message || "Payout request submitted to provider.");
      await loadWallet(merchantEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payout request failed");
    } finally {
      setSaving(false);
    }
  }

  async function refreshStatus(payoutId: string) {
    try {
      setMessage("");
      const response = await fetch("/api/merchant/payouts/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payoutId }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Status refresh failed");
      await loadWallet(merchantEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status refresh failed");
    }
  }

  return (
    <main className="merchant-page min-h-screen bg-[#050917] px-5 py-7 text-white md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">
              Wallet and payouts
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Provider payout requests</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Request INR payouts to bank accounts. Every valid request is
              proxied to your assigned active provider MID for submission.
            </p>
          </div>

          <button
            onClick={() => loadWallet(merchantEmail)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-5 py-3 text-sm font-black hover:bg-white/5"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm font-bold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-[#111827]/80 p-5 shadow-2xl shadow-black/20">
              <p className="text-sm font-bold text-slate-400">{item.label}</p>
              <p className={`mt-3 text-2xl font-black ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <form onSubmit={submitPayout} className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-200">
                <Send className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-black">New payout request</h2>
                <p className="text-sm text-slate-400">Bank transfer details are submitted to your assigned provider route.</p>
              </div>
            </div>

            {primaryAccount ? (
              <div className="mb-5 space-y-3">
                <button
                  type="button"
                  onClick={usePrimaryAccount}
                  className="inline-flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-left text-sm font-bold text-emerald-100 hover:bg-emerald-400/15"
                >
                  <span>
                    Use primary account: <strong>{primaryAccount.label}</strong>
                  </span>
                  <span className="text-xs">Apply</span>
                </button>

                {accounts.length > 0 ? (
                  <label className="block">
                    <span className="text-sm font-bold text-slate-300">Saved destination</span>
                    <select
                      value={form.accountId}
                      onChange={(event) => applySelectedAccount(event.target.value)}
                      className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none focus:border-blue-400"
                    >
                      <option value="">Select saved bank account / UPI</option>
                      {accounts.map((account) => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.label} · {account.accountType === "upi" ? account.upiId : account.bankName || account.accountNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : (
              <a
                href="/merchant/bank-accounts"
                className="mb-5 inline-flex w-full items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-sm font-bold text-amber-100 hover:bg-amber-400/15"
              >
                <span>Add a primary payout account to prefill this form.</span>
                <span className="text-xs">Open</span>
              </a>
            )}

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-slate-950 p-1">
              {(["bank", "upi"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateForm("accountType", type)}
                  className={`rounded-lg px-4 py-3 text-sm font-black capitalize ${
                    form.accountType === type
                      ? "bg-blue-600 text-[var(--gp-accent-contrast)]"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {type === "bank" ? "Bank transfer" : "UPI payout"}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Amount" value={form.amount} onChange={(value) => updateForm("amount", value)} inputMode="decimal" />
              <Field label="Beneficiary mobile" value={form.beneficiaryMobile} onChange={(value) => updateForm("beneficiaryMobile", value)} inputMode="numeric" />
              <Field label="Beneficiary name" value={form.beneficiaryName} onChange={(value) => updateForm("beneficiaryName", value)} />
              {form.accountType === "upi" ? (
                <Field label="UPI ID" value={form.upiId} onChange={(value) => updateForm("upiId", value)} />
              ) : (
                <>
                  <Field label="Bank name" value={form.bankName} onChange={(value) => updateForm("bankName", value)} />
                  <Field label="Account number" value={form.accountNumber} onChange={(value) => updateForm("accountNumber", value)} />
                  <Field label="IFSC" value={form.ifsc} onChange={(value) => updateForm("ifsc", value.toUpperCase())} />
                </>
              )}
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-bold text-slate-300">Remarks</span>
              <textarea
                value={form.note}
                onChange={(event) => updateForm("note", event.target.value)}
                className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                placeholder="Optional payout reference"
              />
            </label>

            <button
              disabled={saving}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowDownToLine className="h-4 w-4" />
              {saving ? "Submitting..." : "Submit payout request"}
            </button>
          </form>

          <section className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6">
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-black">Payout history</h2>
                <p className="text-sm text-slate-400">Provider status and UTR tracking after direct submission.</p>
              </div>
              <span className="rounded bg-slate-950 px-3 py-1 text-xs font-bold text-slate-300">
                {payouts.length} requests
              </span>
            </div>

            {loading ? (
              <p className="py-10 text-slate-400">Loading payouts...</p>
            ) : payouts.length === 0 ? (
              <p className="py-10 text-slate-400">No payout requests yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-[#0b1220] text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-4">Payout</th>
                      <th className="px-4 py-4">Beneficiary</th>
                      <th className="px-4 py-4 text-right">Amount</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-4 py-4">UTR</th>
                      <th className="px-4 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {payouts.map((item) => (
                      <tr key={item.payoutId} className="hover:bg-white/[0.03]">
                        <td className="px-4 py-4">
                          <p className="font-black">{item.payoutId}</p>
                          <p className="text-xs text-slate-500">{shortDate(item.createdAt)}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-200">{item.beneficiaryName}</p>
                          <p className="text-xs text-slate-500">
                            {item.accountType === "upi"
                              ? item.upiId || "UPI"
                              : `${item.ifsc} · ${item.bankName || "Bank"}`}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right font-black">{money(item.amount)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-lg border px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>
                            {item.status || "pending"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-300">{item.utr || "-"}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => refreshStatus(item.payoutId)}
                            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-slate-200 hover:bg-white/5"
                          >
                            Refresh
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none focus:border-blue-400"
      />
    </label>
  );
}
