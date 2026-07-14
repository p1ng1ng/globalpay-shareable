"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CleanupResult = {
  success?: boolean;
  message?: string;
  count?: number;
  requestedCount?: number;
  transactionsModified?: number;
  expiredCount?: number;
};

export default function AdminSettingsPage() {
  const [platformName, setPlatformName] = useState("Wpay");
  const [commissionRate, setCommissionRate] = useState("0.25");
  const [supportEmail, setSupportEmail] = useState("support@Wpay.com");
  const [settlementCycle, setSettlementCycle] = useState("T+2");
  const [cleanupMinutes, setCleanupMinutes] = useState("30");
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [txnCleanupMinutes, setTxnCleanupMinutes] = useState("60");
  const [txnCleanupLoading, setTxnCleanupLoading] = useState(false);
  const [txnCleanupResult, setTxnCleanupResult] =
    useState<CleanupResult | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const savedPlatform = localStorage.getItem("Wpay_platform_settings");

    if (savedPlatform) {
      const platform = JSON.parse(savedPlatform);
      // Initial browser-only settings hydration is intentionally effect-driven.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlatformName(platform.platformName || "Wpay");
      setCommissionRate(platform.commissionRate || "0.25");
      setSupportEmail(platform.supportEmail || "support@Wpay.com");
      setSettlementCycle(platform.settlementCycle || "T+2");
    }
  }, []);

  function savePlatformSettings() {
    const platformSettings = {
      platformName,
      commissionRate,
      supportEmail,
      settlementCycle,
    };

    localStorage.setItem(
      "Wpay_platform_settings",
      JSON.stringify(platformSettings)
    );

    setSaveMessage("Platform settings saved.");
  }

  async function runStaleCleanup(dryRun: boolean) {
    setCleanupLoading(true);
    setCleanupResult(null);

    try {
      const response = await fetch("/api/admin/payment-links/expire-stale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          olderThanMinutes: Number(cleanupMinutes || 30),
          dryRun,
        }),
      });

      const data = await response.json();
      setCleanupResult(data);
    } catch {
      setCleanupResult({
        success: false,
        message: "Failed to run stale payment link cleanup",
      });
    } finally {
      setCleanupLoading(false);
    }
  }

  async function runPendingTransactionCleanup(dryRun: boolean) {
    setTxnCleanupLoading(true);
    setTxnCleanupResult(null);

    try {
      const response = await fetch("/api/admin/transactions/expire-stale-pending", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          olderThanMinutes: Number(txnCleanupMinutes || 60),
          dryRun,
        }),
      });

      const data = await response.json();
      setTxnCleanupResult(data);
    } catch {
      setTxnCleanupResult({
        success: false,
        message: "Failed to run pending transaction cleanup",
      });
    } finally {
      setTxnCleanupLoading(false);
    }
  }
  return (
    <main>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">
              Admin Settings
            </p>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">Platform controls</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              Configure operational defaults and cleanup jobs. Gateway credentials are managed through encrypted reusable templates.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-700">
            Gateway secrets are stored encrypted in PostgreSQL and are never saved in this browser.
          </div>
        </div>

        {saveMessage ? (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-100">
            {saveMessage}
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
              <h2 className="text-2xl font-black">Platform defaults</h2>
              <p className="mt-1 text-sm text-gray-600">
                Merchant-facing name, commission display, support contact, and settlement cycle.
              </p>

              <div className="mt-5 grid gap-4">
                <Field label="Platform Name" value={platformName} onChange={setPlatformName} />
                <Field label="Commission Rate %" value={commissionRate} onChange={setCommissionRate} />
                <Field label="Support Email" value={supportEmail} onChange={setSupportEmail} />
                <Field label="Settlement Cycle" value={settlementCycle} onChange={setSettlementCycle} />
              </div>

              <button
                onClick={savePlatformSettings}
                className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black"
              >
                Save Platform Settings
              </button>
            </div>

            <CleanupPanel
              title="Pending transaction cleanup"
              description="Find old pending transactions and mark them failed. Dry run does not change data."
              minutes={txnCleanupMinutes}
              setMinutes={setTxnCleanupMinutes}
              loading={txnCleanupLoading}
              result={txnCleanupResult}
              onDryRun={() => runPendingTransactionCleanup(true)}
              onRun={() => {
                if (confirm("Mark stale pending transactions as failed now?")) {
                  runPendingTransactionCleanup(false);
                }
              }}
              primaryLabel="Mark Failed Now"
            />

            <CleanupPanel
              title="Stale payment link cleanup"
              description="Expire old active payment links that have not converted."
              minutes={cleanupMinutes}
              setMinutes={setCleanupMinutes}
              loading={cleanupLoading}
              result={cleanupResult}
              onDryRun={() => runStaleCleanup(true)}
              onRun={() => {
                if (confirm("Expire stale payment links now?")) {
                  runStaleCleanup(false);
                }
              }}
              primaryLabel="Expire Links"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <p className="text-xs font-black uppercase text-amber-600">
              Gateway infrastructure
            </p>
            <h2 className="mt-2 text-2xl font-black">Credential templates</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-gray-600">
              Build a reusable set of common and gateway-specific fields, then
              attach that template to one or more MID pools. Values are
              encrypted by Flask before PostgreSQL persistence.
            </p>
            <ol className="mt-6 grid gap-3 text-sm text-gray-700">
              <li>1. Create or update the credential template.</li>
              <li>2. Select the template when creating a MID pool.</li>
              <li>3. Assign the configured MID to merchants.</li>
            </ol>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/admin/gateway-credentials"
                className="rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950"
              >
                Manage credential templates
              </Link>
              <Link
                href="/admin/mid-pools"
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-black"
              >
                Manage MID pools
              </Link>
            </div>
          </div>
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
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border px-4 py-3 outline-none"
      />
    </div>
  );
}

function CleanupPanel({
  title,
  description,
  minutes,
  setMinutes,
  loading,
  result,
  onDryRun,
  onRun,
  primaryLabel,
}: {
  title: string;
  description: string;
  minutes: string;
  setMinutes: (value: string) => void;
  loading: boolean;
  result: CleanupResult | null;
  onDryRun: () => void;
  onRun: () => void;
  primaryLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
      <div className="flex flex-col justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Older Than Minutes" value={minutes} onChange={setMinutes} type="number" />
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-sm text-gray-600">Found</p>
            <p className="mt-1 text-2xl font-black">
              {result?.count ?? result?.requestedCount ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className="text-sm text-gray-600">Modified</p>
            <p className="mt-1 text-2xl font-black">
              {result?.transactionsModified ?? result?.expiredCount ?? 0}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onDryRun}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-black hover:bg-gray-50 disabled:opacity-50"
          >
            Dry Run
          </button>
          <button
            onClick={onRun}
            disabled={loading}
            className="rounded-xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-black text-red-700 hover:bg-red-400/20 disabled:opacity-50"
          >
            {primaryLabel}
          </button>
        </div>

        {result ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <p className={`text-sm font-bold ${result.success ? "text-emerald-600" : "text-red-600"}`}>
              {result.message || "Cleanup result"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

