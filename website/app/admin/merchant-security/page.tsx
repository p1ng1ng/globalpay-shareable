"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminMerchantSecurityPage() {
  const [merchantEmail, setMerchantEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function resetTwoFactor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const confirmed = window.confirm(
      `Reset Google Authenticator for ${merchantEmail}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/admin/merchants/reset-2fa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to reset merchant 2FA");
        return;
      }

      setMessage(data.message || "Merchant 2FA reset successfully");
      setMerchantEmail("");
    } catch {
      setMessage("Failed to reset merchant 2FA.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    window.location.href = "/";
  }

  return (
    <main>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-600">
              Wpay Admin Security
            </p>
            <h1 className="text-4xl font-black">Merchant 2FA Reset</h1>
            <p className="mt-2 text-gray-600">
              Reset Google Authenticator when a merchant loses phone access.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/dashboard"
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Dashboard
            </Link>

            <button
              onClick={logout}
              className="rounded-xl border border-red-300 px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-200 bg-white p-6">
          <h2 className="text-2xl font-black">Reset merchant Google Authenticator</h2>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Enter the merchant login email. This will disable their current
            Google Authenticator secret. The merchant can log in with password
            again and set up 2FA again from Merchant Security.
          </p>

          <form onSubmit={resetTwoFactor} className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">
                Merchant Login Email
              </label>
              <input
                type="email"
                value={merchantEmail}
                onChange={(event) => setMerchantEmail(event.target.value)}
                placeholder="merchant@example.com"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-red-600 px-5 py-4 text-sm font-black text-gray-900 hover:bg-red-700 disabled:opacity-60"
            >
              {loading ? "Resetting..." : "Reset Merchant 2FA"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-50 p-5 text-sm leading-6 text-amber-100">
          Use this only after verifying the merchant identity. This action is
          recorded in Audit Logs.
        </section>
      </div>
    </main>
  );
}

