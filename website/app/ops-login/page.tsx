"use client";

import { useState } from "react";

export default function OpsLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "Login failed");
        return;
      }

      if (data.user?.role !== "ops") {
        setMessage("Only operations users can login here");
        return;
      }

      window.location.href = data.redirectTo || "/ops/dashboard";
    } catch {
      setMessage("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/40">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white">
              GP
            </div>
            <h1 className="text-3xl font-black text-white">Operations Login</h1>
            <p className="mt-2 text-sm text-slate-400">
              Secure access for Wpay operations staff.
            </p>
          </div>

          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Email
              </label>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                type="email"
                placeholder="ops@Wpay.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Password
              </label>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Login to workspace"}
            </button>

            {message ? (
              <div className="rounded-xl border border-red-900 bg-red-950/60 p-3 text-sm font-medium text-red-300">
                {message}
              </div>
            ) : null}
          </form>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-500">
            Employee role dashboards are not enabled yet. Admin and merchant
            users should use their respective login pages.
          </div>
        </div>
      </div>
    </main>
  );
}
