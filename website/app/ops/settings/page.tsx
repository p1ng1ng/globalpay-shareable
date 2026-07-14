"use client";

import { useState } from "react";

export default function OpsSettingsPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setOk(false);

    if (newPassword !== confirmPassword) {
      setMessage("New password and confirm password do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setMessage("New password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/ops/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || "Password change failed.");
        return;
      }

      setOk(true);
      setMessage("Password changed successfully. Please login again.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        window.location.href = "/ops-login";
      }, 1500);
    } catch {
      setMessage("Password change failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-4xl font-black text-white">Ops Settings</h1>
        <p className="mt-2 text-slate-400">
          Change password for your ops login account.
        </p>

        <form
          onSubmit={submit}
          className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/30"
        >
          <h2 className="text-2xl font-black text-white">Change Password</h2>

          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Current Password
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                placeholder="Current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                New Password
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                Confirm New Password
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Changing..." : "Change Password"}
            </button>

            {message ? (
              <div
                className={
                  ok
                    ? "rounded-xl border border-green-900 bg-green-950/60 p-3 text-sm font-medium text-green-300"
                    : "rounded-xl border border-red-900 bg-red-950/60 p-3 text-sm font-medium text-red-300"
                }
              >
                {message}
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </main>
  );
}
