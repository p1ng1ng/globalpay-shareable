"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    window.location.href = "/";
  }

  return (
    <button
      onClick={logout}
      className="fixed right-5 top-5 z-50 rounded-xl border border-red-400/30 bg-red-600 px-4 py-2 text-sm font-black text-white shadow-xl hover:bg-red-700"
    >
      Logout
    </button>
  );
}
