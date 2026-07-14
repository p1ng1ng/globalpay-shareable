import { authHeaders } from "@/lib/clientAuth";

export async function getLoggedInMerchantEmail() {
  const response = await fetch("/api/auth/me", {
    cache: "no-store",
    credentials: "include",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok || !data.success || !data.user) {
    throw new Error("Not logged in");
  }

  if (data.user.role !== "merchant") {
    throw new Error("Only merchant account can use this page");
  }

  return data.user.merchantEmail || data.user.email;
}
