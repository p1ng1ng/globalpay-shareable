import type { EmployeeRole } from "@/lib/auth";

export const EMPLOYEE_ROLES: {
  value: EmployeeRole;
  label: string;
  description: string;
}[] = [
  {
    value: "finance",
    label: "Finance",
    description: "Payouts, settlements and financial reconciliation.",
  },
  {
    value: "tech",
    label: "Tech",
    description: "Payment diagnostics, callbacks and integration logs.",
  },
  {
    value: "operations",
    label: "Operations",
    description: "Transactions, pending payments and daily processing.",
  },
  {
    value: "support",
    label: "Support",
    description: "Transaction lookup and merchant payment assistance.",
  },
];

export const EMPLOYEE_ROLE_VALUES = EMPLOYEE_ROLES.map((role) => role.value);

export function isEmployeeRole(value: unknown): value is EmployeeRole {
  return EMPLOYEE_ROLE_VALUES.includes(value as EmployeeRole);
}
