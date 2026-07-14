"use client";

import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Mail, Save, ShieldCheck, UserRound } from "lucide-react";

type MerchantProfile = {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  businessType: string;
  status: string;
  merchantId?: string;
  activationCount?: number;
  createdAt?: string;
};

type AssignedMid = {
  allocationId: string;
  label: string;
};

const emptyProfile: MerchantProfile = {
  businessName: "",
  ownerName: "",
  email: "",
  phone: "",
  businessType: "Online Business",
  status: "",
};

export default function MerchantProfilePage() {
  const [profile, setProfile] = useState<MerchantProfile>(emptyProfile);
  const [assignedMids, setAssignedMids] = useState<AssignedMid[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function loadProfile() {
    try {
      setLoading(true);
      const response = await fetch("/api/merchant/profile", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load profile");
      }
      setProfile({ ...emptyProfile, ...(data.profile || data.merchant || {}) });

      const midsResponse = await fetch("/api/merchant/mid-allocations", {
        credentials: "include",
        cache: "no-store",
      });
      const midsData = await midsResponse.json();
      if (midsResponse.ok && midsData.success) {
        setAssignedMids(midsData.mids || []);
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to load profile",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function update<K extends keyof MerchantProfile>(key: K, value: MerchantProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/merchant/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          businessName: profile.businessName,
          ownerName: profile.ownerName,
          phone: profile.phone,
          businessType: profile.businessType,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to save profile");
      }
      setProfile({ ...emptyProfile, ...(data.profile || data.merchant || {}) });
      setMessage({ tone: "success", text: "Profile saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to save profile",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="merchant-page min-h-screen bg-[#050917] px-5 py-7 text-white md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-300">
              Merchant identity
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Profile
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
              Manage business details visible to Wpay support and internal operations.
              Login email and account status are protected fields.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Status</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-black text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              {profile.status || "pending"}
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
          <form onSubmit={saveProfile} className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6 shadow-2xl shadow-black/20">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-200">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Business details</h2>
                <p className="text-sm text-slate-400">Editable merchant information.</p>
              </div>
            </div>

            {loading ? (
              <p className="py-10 text-slate-400">Loading profile...</p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Business name" value={profile.businessName} onChange={(value) => update("businessName", value)} />
                  <Field label="Owner / contact person" value={profile.ownerName} onChange={(value) => update("ownerName", value)} />
                  <Field label="Phone" value={profile.phone} onChange={(value) => update("phone", value.replace(/\D/g, "").slice(0, 15))} />
                  <Field label="Business type" value={profile.businessType} onChange={(value) => update("businessType", value)} />
                </div>

                <button
                  disabled={saving}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save profile"}
                </button>
              </>
            )}
          </form>

          <section className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6 shadow-2xl shadow-black/20">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-200">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Account summary</h2>
                <p className="text-sm text-slate-400">Read-only account metadata.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Info icon={<Mail className="h-4 w-4" />} label="Login email" value={profile.email || "-"} />
              <Info icon={<UserRound className="h-4 w-4" />} label="Merchant ID" value={profile.merchantId || "-"} />
              <Info
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Assigned MID labels"
                value={assignedMids.length ? assignedMids.map((mid) => mid.label).join(", ") : "Not assigned"}
              />
              <Info icon={<CheckCircle2 className="h-4 w-4" />} label="Activations" value={String(profile.activationCount || 0)} />
            </div>

            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm font-semibold leading-6 text-amber-50">
              Email, status and merchant ID changes are controlled by Wpay admin for audit safety.
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
    <label className="block">
      <span className="text-sm font-bold text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none focus:border-blue-400"
      />
    </label>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-3 break-all text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}
