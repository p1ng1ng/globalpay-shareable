"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  Banknote,
  BellRing,
  BookOpen,
  CreditCard,
  Gauge,
  KeyRound,
  Link2,
  LogOut,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { clearStoredAuthToken } from "@/lib/clientAuth";
import { getLoggedInMerchantEmail } from "@/lib/getMerchantEmailClient";
import { translate } from "@/lib/i18n";

const sideNav = [
  {
    section: "Main",
    items: [
      { label: "Dashboard", href: "/merchant/dashboard", icon: Gauge },
      { label: "Transactions", href: "/merchant/transactions", icon: Activity },
    ],
  },
  {
    section: "Payment",
    items: [
      { label: "Payment Links", href: "/merchant/payment-links", icon: Link2 },
      { label: "Payment Page / PayMe", href: "/merchant/payment-page", icon: CreditCard },
    ],
  },
  {
    section: "Wallet & Payout",
    items: [
      { label: "Wallet & Payout", href: "/merchant/wallet", icon: WalletCards },
      { label: "Bank Account / UPI", href: "/merchant/bank-accounts", icon: Banknote },
      { label: "Settlements", href: "/merchant/settlements", icon: ArrowDownToLine },
      { label: "Refunds", href: "/merchant/refunds", icon: ArrowDownToLine },
      { label: "Chargebacks", href: "/merchant/chargebacks", icon: ShieldCheck },
    ],
  },
  {
    section: "System Integration",
    items: [
      { label: "Developer / API", href: "/merchant/api-credentials", icon: KeyRound },
      { label: "Integration Guide", href: "/merchant/integration-guide", icon: BookOpen },
      { label: "Webhooks", href: "/merchant/webhooks", icon: BellRing },
      { label: "IP Whitelisting", href: "/merchant/webhooks#ip-whitelist", icon: ShieldCheck },
    ],
  },
  {
    section: "Account",
    items: [
      { label: "Profile", href: "/merchant/profile", icon: UserRound },
      { label: "Security Settings", href: "/merchant/security", icon: ShieldCheck },
      { label: "Support", href: "/merchant/support", icon: BellRing },
      { label: "Settings", href: "/merchant/settings", icon: UserRound },
    ],
  },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MerchantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [merchantEmail, setMerchantEmail] = useState("");
  const { language } = useLanguage();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  useEffect(() => {
    getLoggedInMerchantEmail()
      .then(setMerchantEmail)
      .catch(() => setMerchantEmail(""));
  }, []);

  async function logout() {
    clearStoredAuthToken();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="merchant-shell min-h-screen" style={{ background: 'var(--gp-bg)' }}>
      <div className="flex min-h-screen">
        <aside className="hidden w-[280px] shrink-0 border-r shadow-sm lg:flex lg:flex-col" style={{ 
          borderColor: 'var(--gp-border)', 
          background: 'var(--gp-panel-solid)' 
        }}>
          <Link href="/merchant/dashboard" className="flex h-[80px] items-center gap-3 border-b px-6" style={{ 
            borderColor: 'var(--gp-border)', 
            background: 'var(--gp-panel-solid)' 
          }}>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-black text-white shadow-md">
              W
            </span>
            <span>
              <span className="block text-2xl font-black" style={{ color: 'var(--gp-text)' }}>Wpay</span>
              <span className="block text-xs font-semibold text-blue-600">Merchant Console</span>
            </span>
          </Link>

          <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
            {sideNav.map((group) => (
              <div key={group.section}>
                <p className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--gp-muted)' }}>
                  {group.section}
                </p>

                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);

                    return (
                      <Link
                        key={`${group.section}-${item.href}-${item.label}`}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 ${
                          active
                            ? "merchant-nav-active"
                            : "merchant-nav-inactive"
                        }`}
                      >
                        <Icon className={`h-5 w-5 shrink-0`} style={{ color: active ? '#3b82f6' : 'var(--gp-faint)' }} />
                        <span style={{ color: active ? '#3b82f6' : 'var(--gp-muted)' }}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <button
            onClick={logout}
            className="m-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-600 transition-all hover:bg-red-100 hover:shadow-md dark:border-red-500/20 dark:bg-red-500/10"
          >
            <LogOut className="h-5 w-5" />
            {t("logout")}
          </button>
        </aside>

        <section className="min-w-0 flex-1" style={{ background: 'var(--gp-bg)' }}>
          <header className="sticky top-0 z-40 flex min-h-[80px] items-center justify-between gap-4 border-b px-6 shadow-sm backdrop-blur-xl md:px-8" style={{ 
            borderColor: 'var(--gp-border)', 
            background: 'var(--gp-panel-solid)' 
          }}>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-600">
                Wpay merchant
              </p>
              <p className="mt-1 truncate text-lg font-bold" style={{ color: 'var(--gp-text)' }}>
                Collections, links, wallet and API overview
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden rounded-xl border px-5 py-3 shadow-sm sm:block" style={{ 
                borderColor: 'var(--gp-border)', 
                background: 'var(--gp-panel-solid)' 
              }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--gp-muted)' }}>{t("merchant")}</p>
                <p className="max-w-[220px] truncate text-sm font-bold" style={{ color: 'var(--gp-text)' }}>
                  {merchantEmail ? merchantEmail.split("@")[0] : "Merchant"}
                </p>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-sm font-black text-white shadow-lg">
                {merchantEmail ? merchantEmail.slice(0, 2).toUpperCase() : "W"}
              </div>
            </div>
          </header>

          <div className="pt-6">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
