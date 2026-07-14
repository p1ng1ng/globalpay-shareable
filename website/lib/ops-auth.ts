import { getCurrentUser } from "@/lib/auth";

export type OpsUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  merchantEmail?: string;
  employeeRoles?: string[];
};

export async function getOpsUser(): Promise<OpsUser | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  if (user.role !== "admin" && user.role !== "ops") {
    return null;
  }

  return user;
}

export function canOpsView(user: OpsUser | null) {
  return (
    !!user &&
    (user.role === "admin" || user.role === "ops")
  );
}

export function isAdmin(user: OpsUser | null) {
  return !!user && user.role === "admin";
}
