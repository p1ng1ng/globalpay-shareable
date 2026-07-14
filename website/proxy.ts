import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || "";
  return new TextEncoder().encode(secret);
}

async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get("Wpay_token")?.value;

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, getJwtSecret());

    return verified.payload as {
      role?: string;
      email?: string;
    };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("ngrok-skip-browser-warning", "true");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const isAdminPath = pathname.startsWith("/admin");
  const isMerchantPath = pathname.startsWith("/merchant");

  if (!isAdminPath && !isMerchantPath) {
    return NextResponse.next();
  }

  const user = await getUserFromRequest(request);

  if (!user) {
    const loginUrl = new URL(isAdminPath ? "/admin-login" : "/", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminPath && user.role !== "admin") {
    return NextResponse.redirect(new URL("/merchant/dashboard", request.url));
  }

  if (isMerchantPath && user.role !== "merchant") {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/merchant/:path*", "/api/:path*"],
};
