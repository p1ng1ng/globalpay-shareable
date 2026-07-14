import Link from "next/link";
import { redirect } from "next/navigation";
import { getOpsUser } from "@/lib/ops-auth";

const navItems = [
  { href: "/ops/dashboard", label: "Dashboard" },
  { href: "/ops/transactions", label: "Transactions" },
  { href: "/ops/pending-payments", label: "Pending Payments" },
  { href: "/ops/settlements", label: "PG Settlements" },
  { href: "/ops/payouts", label: "Payout Settlements" },
  { href: "/ops/webhook-logs", label: "Webhook Logs" },
  { href: "/ops/payment-check", label: "Payment Check" },
  { href: "/ops/settings", label: "Settings" },
];

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getOpsUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed left-0 top-0 h-full w-72 border-r border-white/10 bg-slate-950/95 p-4 text-white backdrop-blur-xl">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 font-black text-emerald-300">
              GP
            </span>
            <div className="text-xl font-black tracking-tight">Staff console</div>
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {user.email} · {user.role}
          </div>
        </div>

        <nav className="mt-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-xl px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-4">
          <Link
            href="/"
            className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold hover:bg-white/10"
          >
            Back to Login
          </Link>
        </div>
      </aside>

      <main className="ml-72 min-h-screen bg-slate-950 p-8 text-slate-100">{children}</main>
    </div>
  );
}
