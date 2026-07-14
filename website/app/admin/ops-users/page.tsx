"use client";

import { useEffect, useState } from "react";

export default function AdminOpsUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function loadUsers() {
    fetch("/api/admin/ops-users", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/ops-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const data = await res.json();
      setMessage(data.message || (data.success ? "Created" : "Failed"));

      if (data.success) {
        setForm({ name: "", email: "", password: "" });
        loadUsers();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900">Ops Users</h1>
      <p className="mt-2 text-slate-600">
        Create office staff users with limited operations access.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-8">
        <form onSubmit={createUser} className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-bold">Create Office Staff User</h2>

          <div className="mt-5 space-y-4">
            <input
              className="w-full rounded-lg border p-3"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name"
            />

            <input
              className="w-full rounded-lg border p-3"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
            />

            <input
              className="w-full rounded-lg border p-3"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Password"
            />

            <button
              disabled={loading}
              className="w-full rounded-lg bg-white px-5 py-3 font-semibold text-gray-900 disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create Ops User"}
            </button>

            {message ? (
              <div className="rounded-lg bg-slate-100 p-3 text-sm">
                {message}
              </div>
            ) : null}
          </div>
        </form>

        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-bold">Ops Access</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-lg bg-green-50 p-3 text-green-800">
              Can view transactions, pending payments, PG settlements and payout settlements.
            </div>
            <div className="rounded-lg bg-red-50 p-3 text-red-800">
              Cannot access finance, pricing, settings, MID rules or user management.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="border-t">
                <td className="p-3 font-medium">{user.name}</td>
                <td className="p-3">{user.email}</td>
                <td className="p-3">{user.role}</td>
                <td className="p-3">{user.status || "active"}</td>
                <td className="p-3">
                  {user.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}
                </td>
              </tr>
            ))}

            {users.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={5}>
                  No ops users yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

