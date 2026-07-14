"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { storeAuthToken } from "@/lib/clientAuth";
import { Eye, EyeOff, Mail, Lock, Shield, ArrowRight, Zap, DollarSign, TrendingUp } from "lucide-react";

export default function LoginClient({ allowAdmin = false }: { allowAdmin?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirect = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          twoFactorCode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.requiresTwoFactor) {
          setShowTwoFactor(true);
        }
        setMessage(data.message || "Login failed");
        return;
      }

      storeAuthToken(data.token);

      if (data.user.role === "admin") {
        if (!allowAdmin) {
          setMessage("Admin login is not allowed from public page.");
          return;
        }

        router.push("/admin/dashboard");
        return;
      }

      if (redirect && !redirect.startsWith("/admin")) {
        router.push(redirect);
        return;
      }

      router.push(
        data.user?.role === "ops" ? "/ops/dashboard" : "/merchant/dashboard"
      );
    } catch {
      setMessage("Something went wrong while logging in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen">
      {/* Left Panel - Branding */}
      <div className="relative hidden w-full lg:flex lg:w-1/2">
        {/* Consistent Blue Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700">
          {/* Subtle Background Elements */}
          <div className="absolute inset-0">
            <div className="absolute left-10 top-20 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl"></div>
            <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-blue-400/30 blur-3xl"></div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex h-full w-full flex-col justify-center px-16 py-12">
          {/* Logo - Top Left */}
          <div className="absolute left-16 top-12 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
              <span className="text-xl font-semibold text-blue-600">W</span>
            </div>
            <span className="text-xl font-semibold text-white">Wpay</span>
          </div>

          {/* Main Content - Centered */}
          <div className="max-w-lg">
            <h1 className="mb-6 text-[56px] font-semibold leading-[1.1] tracking-tight text-white">
              {allowAdmin 
                ? "Power your payment operations" 
                : "Power your business with seamless payments"}
            </h1>
            
            <p className="mb-10 text-[19px] leading-relaxed text-blue-50">
              {allowAdmin
                ? "Manage transactions, merchants, and settlements with complete control and real-time insights."
                : "Accept payments, create instant payment links, and grow your business with our powerful platform."}
            </p>

            <div className="space-y-4">
              {allowAdmin ? (
                <>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[17px] text-blue-50">Complete merchant & transaction oversight</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[17px] text-blue-50">Advanced routing & settlement tools</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[17px] text-blue-50">Real-time analytics & reporting</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[17px] text-blue-50">Quick & easy integration</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[17px] text-blue-50">Instant payment confirmations</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[17px] text-blue-50">Powerful dashboard & insights</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer - Bottom Left */}
          <div className="absolute bottom-12 left-16">
            <p className="text-sm text-blue-100">© 2026 Wpay</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex w-full items-center justify-center bg-white p-6 lg:w-1/2 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo (only visible on mobile) */}  
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
              <span className="text-2xl font-semibold text-white">W</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-800">Wpay</h1>
            <p className="text-sm font-normal text-gray-600">
              {allowAdmin ? "Admin Console" : "Merchant Portal"}
            </p>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-medium text-gray-900">Welcome back</h2>
            <p className="mt-2 font-normal text-gray-600">
              {allowAdmin 
                ? "Sign in to access the admin console" 
                : "Sign in to manage your payments"}
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                <Mail className="h-5 w-5 shrink-0 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                <Lock className="h-5 w-5 shrink-0 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="shrink-0 text-gray-400 transition hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* 2FA */}
            {showTwoFactor && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Two-Factor Code
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                  <Shield className="h-5 w-5 shrink-0 text-gray-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    placeholder="000000"
                    className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {message && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-normal text-red-700">
                {message}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-xl bg-blue-600 py-4 font-medium text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Links */}
          <div className="mt-8 space-y-4 text-center text-sm">
            {!allowAdmin ? (
              <>
                <div>
                  <Link
                    href="/merchant-signup"
                    className="font-medium text-blue-600 transition hover:text-blue-700"
                  >
                    Create merchant account
                  </Link>
                </div>
                <div>
                  <span className="font-normal text-gray-500">Need admin access?</span>{" "}
                  <Link
                    href="/admin-login"
                    className="font-medium text-gray-700 transition hover:text-gray-900"
                  >
                    Admin login →
                  </Link>
                </div>
              </>
            ) : (
              <div>
                <Link
                  href="/"
                  className="font-medium text-gray-700 transition hover:text-gray-900"
                >
                  ← Back to merchant login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
