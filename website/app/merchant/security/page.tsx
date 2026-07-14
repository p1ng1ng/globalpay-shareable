"use client";

import { useState } from "react";
import Link from "next/link";

export default function MerchantSecurityPage() {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function startSetup() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/merchant/2fa/setup", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to start setup");
        return;
      }

      setQrCodeDataUrl(data.qrCodeDataUrl || "");
      setSecret(data.secret || "");
      setMessage("Scan the QR code in Google Authenticator, then enter the 6-digit code.");
    } catch {
      setMessage("Failed to start Google Authenticator setup.");
    } finally {
      setLoading(false);
    }
  }

  async function verifySetup() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/merchant/2fa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Invalid code");
        return;
      }

      setMessage("Google Authenticator is now enabled for your merchant login.");
      setQrCodeDataUrl("");
      setSecret("");
      setCode("");
    } catch {
      setMessage("Failed to verify Google Authenticator code.");
    } finally {
      setLoading(false);
    }
  }

  async function disableTwoFactor() {
    const confirmDisable = window.confirm(
      "Disable Google Authenticator for this merchant account?"
    );

    if (!confirmDisable) {
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/merchant/2fa/disable", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Failed to disable 2FA");
        return;
      }

      setMessage("Google Authenticator has been disabled.");
      setQrCodeDataUrl("");
      setSecret("");
      setCode("");
    } catch {
      setMessage("Failed to disable Google Authenticator.");
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
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-300">
              Wpay Merchant Security
            </p>
            <h1 className="text-4xl font-black">Google Authenticator</h1>
            <p className="mt-2 text-slate-400">
              Add a 6-digit authenticator code to protect merchant login.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/merchant/dashboard"
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Dashboard
            </Link>

            <button
              onClick={logout}
              className="rounded-xl border border-red-400/30 px-5 py-3 text-sm font-bold text-red-200 hover:bg-red-400/10"
            >
              Logout
            </button>
          </div>
        </div>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-black">Enable 2FA</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Open Google Authenticator on your phone, scan the QR code, then enter
            the 6-digit code shown in the app. After enabling, merchant login
            will require email, password and this 6-digit code.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={startSetup}
              disabled={loading}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Please wait..." : "Start Google Authenticator Setup"}
            </button>

            <button
              onClick={disableTwoFactor}
              disabled={loading}
              className="rounded-xl border border-red-400/30 px-5 py-3 text-sm font-black text-red-200 hover:bg-red-400/10 disabled:opacity-60"
            >
              Disable 2FA
            </button>
          </div>

          {qrCodeDataUrl ? (
            <div className="mt-8 grid gap-6 md:grid-cols-[260px_1fr]">
              <div className="rounded-3xl bg-white p-5">
                <img
                  src={qrCodeDataUrl}
                  alt="Google Authenticator QR Code"
                  className="h-auto w-full rounded-2xl"
                />
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900 p-5">
                <p className="text-sm font-bold text-slate-300">
                  Manual setup secret
                </p>
                <p className="mt-2 break-all rounded-xl bg-black/30 p-3 font-mono text-sm text-emerald-200">
                  {secret}
                </p>

                <label className="mt-5 block text-sm font-bold text-slate-300">
                  6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
                />

                <button
                  onClick={verifySetup}
                  disabled={loading || code.length < 6}
                  className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Verify and Enable 2FA
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
          Important: save your Google Authenticator setup safely. If you lose your
          phone, admin must disable 2FA for your merchant account.
        </section>
      </div>
    </main>
  );
}
