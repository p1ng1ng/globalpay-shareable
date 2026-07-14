"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  Banknote,
  BellRing,
  Building2,
  Coins,
  FileCheck,
  Gauge,
  KeyRound,
  Landmark,
  Layers,
  Link2,
  LogOut,
  Percent,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  Tag,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { clearStoredAuthToken } from "@/lib/clientAuth";

const sideNav = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: Gauge },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    section: "Merchants & Access",
    items: [
      { label: "Merchants", href: "/admin/merchants", icon: Building2 },
      { label: "Merchant Security", href: "/admin/merchant-security", icon: ShieldCheck },
      { label: "Employees", href: "/admin/employees", icon: Users },
      { label: "Ops Users", href: "/admin/ops-users", icon: UserCog },
      { label: "Users", href: "/admin/users", icon: UserRound },
    ],
  },
  {
    section: "Transactions & Risk",
    items: [
      { label: "Transactions", href: "/admin/transactions", icon: Activity },
      { label: "Refunds", href: "/admin/refunds", icon: ArrowDownToLine },
      { label: "Mismatches", href: "/admin/mismatches", icon: AlertTriangle },
      { label: "Webhook Logs", href: "/admin/webhook-logs", icon: BellRing },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Finance Overview", href: "/admin/finance", icon: Wallet },
      { label: "Payouts", href: "/admin/finance/payouts", icon: Banknote },
      { label: "Pricing", href: "/admin/finance/pricing", icon: Tag },
      { label: "USDT Settlements", href: "/admin/finance/settlements", icon: Coins },
      { label: "Settlements", href: "/admin/settlements", icon: ArrowDownToLine },
      { label: "Commissions", href: "/admin/commissions", icon: Percent },
    ],
  },
  {
    section: "Routing & Rails",
    items: [
      { label: "MID Pools", href: "/admin/mid-pools", icon: Layers },
      { label: "Gateway Credentials", href: "/admin/gateway-credentials", icon: KeyRound },
      { label: "Pipe Routing", href: "/admin/pipe-routing", icon: Link2 },
      { label: "Bank Rails", href: "/admin/bank-rails", icon: Landmark },
      { label: "Bank Rail Routing", href: "/admin/bank-rail-routing", icon: Route },
      { label: "UTR Verification Jobs", href: "/admin/bank-verification-jobs", icon: FileCheck },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    section: "OTP Monitoring",
    items: [
      { label: "Activation Codes", href: "/admin/activation-codes", icon: Activity },
      { label: "OTP Devices", href: "/admin/otp-devices", icon: Activity },
      { label: "OTP Alerts", href: "/admin/otp-alerts", icon: BellRing },
    ],
  },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/admin/dashboard") return pathname === href;
  if (href === "/admin/finance") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [adminUser, setAdminUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    // Fetch admin user info from the stored token or API
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          setAdminUser({
            name: data.user.name || "Admin",
            email: data.user.email || "",
          });
        }
      })
      .catch(() => setAdminUser(null));
  }, []);

  async function logout() {
    clearStoredAuthToken();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="admin-shell min-h-screen" style={{ background: 'var(--gp-bg)' }}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-[280px] shrink-0 border-r shadow-sm lg:flex lg:flex-col" style={{ 
          borderColor: 'var(--gp-border)', 
          background: 'var(--gp-panel-solid)' 
        }}>
          <Link href="/admin/dashboard" className="flex h-[80px] items-center gap-3 border-b px-6" style={{ 
            borderColor: 'var(--gp-border)', 
            background: 'var(--gp-panel-solid)' 
          }}>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-black text-white shadow-md">
              W
            </span>
            <span>
              <span className="block text-2xl font-black" style={{ color: 'var(--gp-text)' }}>Wpay</span>
              <span className="block text-xs font-semibold text-blue-600">Admin Console</span>
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
                            ? "admin-nav-active"
                            : "admin-nav-inactive"
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
            Logout
          </button>
        </aside>

        {/* Main Content */}
        <section className="min-w-0 flex-1" style={{ background: 'var(--gp-bg)' }}>
          <header className="sticky top-0 z-40 flex min-h-[80px] items-center justify-between gap-4 border-b px-6 shadow-sm backdrop-blur-xl md:px-8" style={{ 
            borderColor: 'var(--gp-border)', 
            background: 'var(--gp-panel-solid)' 
          }}>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-600">
                Wpay Admin
              </p>
              <p className="mt-1 truncate text-lg font-semibold" style={{ color: 'var(--gp-text)' }}>
                Payment operations console
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden rounded-lg border px-5 py-3 shadow-sm sm:block" style={{ 
                borderColor: 'var(--gp-border)', 
                background: 'var(--gp-panel-solid)' 
              }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--gp-muted)' }}>Admin workspace</p>
                <p className="max-w-[220px] truncate text-sm font-semibold" style={{ color: 'var(--gp-text)' }}>
                  {adminUser?.name || "Admin"}
                </p>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white shadow-md">
                {adminUser?.email ? adminUser.email.slice(0, 2).toUpperCase() : "W"}
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
