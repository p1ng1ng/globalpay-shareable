"use client";

import Link from "next/link";
import {
  BellRing,
  CreditCard,
  KeyRound,
  Languages,
  ShieldCheck,
  UserRound,
  Webhook,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const settingCards = [
  {
    title: "Profile",
    text: "Business name, owner contact and account metadata.",
    href: "/merchant/profile",
    icon: UserRound,
  },
  {
    title: "Bank Account / UPI",
    text: "Primary payout bank account, UPI ID and beneficiary details.",
    href: "/merchant/bank-accounts",
    icon: CreditCard,
  },
  {
    title: "Developer / API",
    text: "Wpay pay-in and payout API keys.",
    href: "/merchant/api-credentials",
    icon: KeyRound,
  },
  {
    title: "Webhooks",
    text: "Signed callbacks, redirect URLs and IP whitelisting.",
    href: "/merchant/webhooks",
    icon: Webhook,
  },
  {
    title: "Security",
    text: "Password, 2FA and account protection controls.",
    href: "/merchant/security",
    icon: ShieldCheck,
  },
  {
    title: "Support",
    text: "Contact Wpay operations for payout and API issues.",
    href: "/merchant/support",
    icon: BellRing,
  },
];

export default function MerchantSettingsPage() {
  return (
    <main className="merchant-page min-h-screen bg-[#050917] px-5 py-7 text-white md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-300">
            Merchant preferences
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Settings
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
            Central settings for appearance, language, payout destinations,
            API access and secure callbacks.
          </p>
        </header>

        <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-200">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black">Appearance</h2>
                  <p className="text-sm text-slate-400">
                    Use the bottom-right mode control to switch light and dark themes across the portal.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111827]/80 p-6 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-200">
                  <Languages className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black">Language</h2>
                  <p className="text-sm text-slate-400">Your preference is remembered on this browser.</p>
                </div>
              </div>
              <div className="mt-5">
                <LanguageSwitcher />
              </div>
            </div>
          </div>

          <section className="grid gap-4 md:grid-cols-2">
            {settingCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group rounded-2xl border border-white/10 bg-[#111827]/80 p-5 shadow-2xl shadow-black/20 hover:border-emerald-400/20 hover:bg-white/5"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="mt-5 text-lg font-black text-slate-100">{card.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{card.text}</p>
                  <p className="mt-4 text-sm font-black text-emerald-300 group-hover:text-emerald-200">
                    Open
                  </p>
                </Link>
              );
            })}
          </section>
        </section>
      </div>
    </main>
  );
}
