import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

const COOKIE_NAME = "Wpay_token";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "merchant" | "ops" | "employee";
  merchantEmail: string;
  employeeRoles?: EmployeeRole[];
};

export type EmployeeRole = "finance" | "tech" | "operations" | "support";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }

  return new TextEncoder().encode(secret);
}

export async function createAuthToken(user: AuthUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecret());
    return verified.payload as AuthUser;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyAuthToken(token);
}

export const authCookieName = COOKIE_NAME;
