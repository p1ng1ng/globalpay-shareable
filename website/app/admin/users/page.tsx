"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type User = {
  _id: string;
  name: string;
  email: string;
  role: string;
  merchantEmail: string;
  status: string;
  createdAt: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");

  async function loadUsers() {
    try {
      setLoading(true);

      const response = await fetch("/api/users", {
        cache: "no-store",
      });

      const data = await response.json();

      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  }

  async function updateUserStatus(id: string, status: "active" | "blocked") {
    try {
      setSavingId(id);

      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || "Failed to update user");
        return;
      }

      await loadUsers();
    } catch {
      alert("Something went wrong while updating user.");
    } finally {
      setSavingId("");
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const adminUsers = users.filter((user) => user.role === "admin").length;
  const merchantUsers = users.filter((user) => user.role === "merchant").length;
  const blockedUsers = users.filter((user) => user.status === "blocked").length;

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.3em] text-blue-600">
              Wpay Admin
            </p>
            <h1 className="text-4xl font-black">Login Users</h1>
            <p className="mt-2 text-gray-600">
              Manage admin and merchant login access.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadUsers}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-700"
            >
              Refresh
            </button>

            <Link
              href="/admin/dashboard"
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Total Users</p>
            <p className="mt-2 text-3xl font-black">{users.length}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Admins</p>
            <p className="mt-2 text-3xl font-black text-blue-600">{adminUsers}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Merchants</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">{merchantUsers}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Blocked</p>
            <p className="mt-2 text-3xl font-black text-red-600">{blockedUsers}</p>
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-black">All Login Users</h2>
          </div>

          {loading ? (
            <div className="p-8 text-gray-700">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-gray-700">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-white text-gray-700">
                  <tr>
                    <th className="px-5 py-4">Name</th>
                    <th className="px-5 py-4">Email</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Merchant Email</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <tr key={user._id} className="border-t border-gray-200">
                      <td className="px-5 py-4">
                        <p className="font-bold">{user.name}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(user.createdAt).toLocaleString()}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-700">{user.email}</td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                          {user.role}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-gray-700">
                        {user.merchantEmail || "-"}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            user.status === "active"
                              ? "bg-emerald-100 text-emerald-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={savingId === user._id}
                            onClick={() => updateUserStatus(user._id, "active")}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Activate
                          </button>

                          <button
                            disabled={savingId === user._id}
                            onClick={() => updateUserStatus(user._id, "blocked")}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                          >
                            Block
                          </button>
                        </div>

                        {savingId === user._id ? (
                          <p className="mt-2 text-xs text-blue-600">Saving...</p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

