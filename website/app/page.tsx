import { Suspense } from "react";
import LoginClient from "./login-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 text-gray-900">
          <div className="rounded-2xl border border-blue-100 bg-white px-6 py-4 shadow-lg">
            Loading Wpay...
          </div>
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
