import { Suspense } from "react";
import LoginClient from "../login-client";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white p-8">Loading...</div>}>
      <LoginClient allowAdmin />
    </Suspense>
  );
}
