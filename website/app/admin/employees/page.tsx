"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CirclePause,
  CirclePlay,
  RefreshCw,
  Save,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { EMPLOYEE_ROLES } from "@/lib/employee-roles";
import type { EmployeeRole } from "@/lib/auth";

type Employee = {
  _id: string;
  name: string;
  email: string;
  employeeRoles: EmployeeRole[];
  status: "active" | "blocked";
  createdAt?: string;
  legacyOpsUser?: boolean;
};

type RoleDrafts = Record<string, EmployeeRole[]>;

const emptyForm = {
  name: "",
  email: "",
  password: "",
  employeeRoles: [] as EmployeeRole[],
};

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [roleDrafts, setRoleDrafts] = useState<RoleDrafts>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/employees", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load employees");
      }

      const nextEmployees = data.employees || [];
      setEmployees(nextEmployees);
      setRoleDrafts(
        Object.fromEntries(
          nextEmployees.map((employee: Employee) => [
            employee._id,
            employee.employeeRoles || [],
          ])
        )
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to load employees"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial remote data hydration is intentionally effect-driven.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEmployees();
  }, [loadEmployees]);

  function toggleFormRole(role: EmployeeRole) {
    setForm((current) => ({
      ...current,
      employeeRoles: current.employeeRoles.includes(role)
        ? current.employeeRoles.filter((item) => item !== role)
        : [...current.employeeRoles, role],
    }));
  }

  function toggleDraftRole(employeeId: string, role: EmployeeRole) {
    setRoleDrafts((current) => {
      const roles = current[employeeId] || [];
      return {
        ...current,
        [employeeId]: roles.includes(role)
          ? roles.filter((item) => item !== role)
          : [...roles, role],
      };
    });
  }

  async function createEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to create employee");
      }

      setForm(emptyForm);
      setMessageType("success");
      setMessage("Employee account created.");
      await loadEmployees();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to create employee"
      );
    } finally {
      setCreating(false);
    }
  }

  async function updateEmployee(
    employee: Employee,
    updates: Record<string, unknown>
  ) {
    setSavingId(employee._id);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/employees/${employee._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update employee");
      }

      setMessageType("success");
      setMessage(data.message || "Employee updated.");
      await loadEmployees();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Failed to update employee"
      );
    } finally {
      setSavingId("");
    }
  }

  const activeEmployees = employees.filter(
    (employee) => employee.status === "active"
  ).length;

  return (
    <main>
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-blue-600">
              Access control
            </p>
            <h1 className="mt-2 text-4xl font-black text-gray-900">Employees</h1>
            <p className="mt-2 max-w-2xl text-gray-600">
              Create staff accounts and assign access by department.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadEmployees}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Employees</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{employees.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Active</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">
              {activeEmployees}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">Department roles</p>
            <p className="mt-2 text-3xl font-black text-gray-900">
              {EMPLOYEE_ROLES.length}
            </p>
          </div>
        </div>

        {message ? (
          <div
            className={`mt-6 rounded-xl border px-4 py-3 text-sm font-semibold ${
              messageType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <form
            onSubmit={createEmployee}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <UserPlus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">New employee</h2>
                <p className="text-sm text-gray-600">Create login access.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">
                  Full name
                </span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">
                  Work email
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">
                  Temporary password
                </span>
                <input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                  required
                />
              </label>

              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-gray-700">
                  Department roles
                </legend>
                <div className="grid gap-2">
                  {EMPLOYEE_ROLES.map((role) => (
                    <label
                      key={role.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                        form.employeeRoles.includes(role.value)
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.employeeRoles.includes(role.value)}
                        onChange={() => toggleFormRole(role.value)}
                        className="mt-1 h-4 w-4 accent-blue-600"
                      />
                      <span>
                        <span className="block text-sm font-bold text-gray-900">
                          {role.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-gray-600">
                          {role.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                disabled={creating || form.employeeRoles.length === 0}
                className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-black text-gray-900 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create employee"}
              </button>
            </div>
          </form>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <h2 className="font-black text-gray-900">Employee access</h2>
                <p className="text-xs text-gray-600">
                  Role dashboards will be enabled in a later phase.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-gray-600">Loading employees...</div>
            ) : employees.length === 0 ? (
              <div className="p-8 text-gray-600">
                No employee accounts have been created.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-5 py-4">Employee</th>
                      <th className="px-5 py-4">Roles</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Created</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => {
                      const draftRoles =
                        roleDrafts[employee._id] || employee.employeeRoles;
                      const rolesChanged =
                        [...draftRoles].sort().join(",") !==
                        [...employee.employeeRoles].sort().join(",");

                      return (
                        <tr
                          key={employee._id}
                          className="border-t border-gray-200 align-top"
                        >
                          <td className="px-5 py-5">
                            <p className="font-bold text-gray-900">{employee.name}</p>
                            <p className="mt-1 text-xs text-gray-600">
                              {employee.email}
                            </p>
                            {employee.legacyOpsUser ? (
                              <p className="mt-2 text-xs font-semibold text-amber-600">
                                Legacy ops account
                              </p>
                            ) : null}
                          </td>
                          <td className="px-5 py-5">
                            <div className="flex max-w-sm flex-wrap gap-2">
                              {EMPLOYEE_ROLES.map((role) => {
                                const selected = draftRoles.includes(role.value);
                                return (
                                  <button
                                    key={role.value}
                                    type="button"
                                    onClick={() =>
                                      toggleDraftRole(employee._id, role.value)
                                    }
                                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                                      selected
                                        ? "border-blue-500 bg-blue-50 text-blue-700"
                                        : "border-gray-200 text-gray-600 hover:text-gray-900"
                                    }`}
                                    aria-pressed={selected}
                                  >
                                    {role.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-5 py-5">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                employee.status === "active"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {employee.status}
                            </span>
                          </td>
                          <td className="px-5 py-5 text-gray-600">
                            {employee.createdAt
                              ? new Date(employee.createdAt).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="px-5 py-5">
                            <div className="flex justify-end gap-2">
                              {rolesChanged ? (
                                <button
                                  type="button"
                                  title="Save roles"
                                  disabled={
                                    savingId === employee._id ||
                                    draftRoles.length === 0
                                  }
                                  onClick={() =>
                                    updateEmployee(employee, {
                                      employeeRoles: draftRoles,
                                    })
                                  }
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-gray-900 hover:bg-blue-700 disabled:opacity-50"
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                title={
                                  employee.status === "active"
                                    ? "Block employee"
                                    : "Activate employee"
                                }
                                disabled={savingId === employee._id}
                                onClick={() =>
                                  updateEmployee(employee, {
                                    employeeRoles: draftRoles,
                                    status:
                                      employee.status === "active"
                                        ? "blocked"
                                        : "active",
                                  })
                                }
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-50 ${
                                  employee.status === "active"
                                    ? "border-red-200 text-red-700 hover:bg-red-50"
                                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                }`}
                              >
                                {employee.status === "active" ? (
                                  <CirclePause className="h-4 w-4" />
                                ) : (
                                  <CirclePlay className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

