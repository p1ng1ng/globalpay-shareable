"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminLinks = [
  { label: "Overview", href: "/admin/dashboard" },
  { label: "Merchants", href: "/admin/merchants" },
  { label: "Employees", href: "/admin/employees" },
  { label: "Transactions", href: "/admin/transactions" },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Finance", href: "/admin/finance" },
  { label: "USDT", href: "/admin/finance/settlements" },
  { label: "Pricing", href: "/admin/finance/pricing" },
  { label: "MID pools", href: "/admin/mid-pools" },
  { label: "Credentials", href: "/admin/gateway-credentials" },
  { label: "Routing", href: "/admin/pipe-routing" },
  { label: "Bank rails", href: "/admin/bank-rails" },
  { label: "Bank routing", href: "/admin/bank-rail-routing" },
  { label: "UTR jobs", href: "/admin/bank-verification-jobs" },
  { label: "Refunds", href: "/admin/refunds" },
  { label: "Settlements", href: "/admin/settlements" },
  { label: "Logs", href: "/admin/audit-logs" },
  { label: "Settings", href: "/admin/settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin/dashboard") return pathname === href;
  if (href === "/admin/finance") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminTopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-1.5 shadow-xl"
      aria-label="Admin navigation"
    >
      {adminLinks.map((link) => {
        const active = isActive(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold ${
              active
                ? "bg-blue-600 text-white shadow-lg"
                : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
