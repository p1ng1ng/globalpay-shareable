"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, User, Mail, Phone, Briefcase, Lock, ArrowRight, Check, Sparkles, Shield, Zap } from "lucide-react";

type FormState = {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  businessType: string;
  password: string;
};

export default function MerchantSignupPage() {
  const [form, setForm] = useState<FormState>({
    businessName: "",
    ownerName: "",
    email: "",
    phone: "",
    businessType: "Online Business",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setSuccess(false);

    try {
      const response = await fetch("/api/merchants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Registration failed. Please try again.");
        setSuccess(false);
        return;
      }

      setSuccess(true);
      setMessage(
        "Account created successfully! You can login after admin activates your account."
      );

      setForm({
        businessName: "",
        ownerName: "",
        email: "",
        phone: "",
        businessType: "Online Business",
        password: "",
      });
    } catch {
      setMessage("Something went wrong. Please try again.");
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-screen">
        {/* Left Panel - Success Message */}
        <div className="relative hidden w-full lg:flex lg:w-1/2">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-green-700 to-teal-800">
            <div className="absolute inset-0">
              <div className="absolute left-10 top-20 h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl"></div>
              <div className="absolute bottom-20 right-10 h-72 w-72 rounded-full bg-teal-400/30 blur-3xl"></div>
            </div>
          </div>

          <div className="relative z-10 flex w-full flex-col justify-center p-12">
            <div className="mx-auto max-w-md">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-2xl">
                <Check className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="mb-4 text-4xl font-medium text-white">Success!</h2>
              <p className="text-lg text-emerald-100">
                Your merchant account has been created. We'll notify you once it's activated.
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel - Next Steps */}
        <div className="flex w-full items-center justify-center bg-white p-6 lg:w-1/2 lg:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-medium text-gray-900">Account Created!</h2>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-medium text-gray-900">What happens next?</h3>
                <p className="mt-2 font-normal text-gray-600">Follow these steps to get started with Wpay</p>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                    1
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Admin Reviews Your Application</p>
                    <p className="mt-1 text-sm text-gray-600">Our team will review your business details</p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                    2
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Account Activation</p>
                    <p className="mt-1 text-sm text-gray-600">You'll receive an email once approved</p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-600">
                    3
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Start Accepting Payments</p>
                    <p className="mt-1 text-sm text-gray-600">Login and create your first payment link</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">
                  💡 Pro Tip: Check your email for the activation notification
                </p>
              </div>

              <Link
                href="/"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-4 font-bold text-white shadow-lg transition hover:shadow-xl"
              >
                Go to Login
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen">
      {/* Left Panel - Branding */}
      <div className="relative hidden w-full lg:flex lg:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700">
          <div className="absolute inset-0">
            <div className="absolute left-10 top-20 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl"></div>
            <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-blue-400/30 blur-3xl"></div>
          </div>
        </div>

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
              Start accepting payments today
            </h1>
            
            <p className="mb-10 text-[19px] leading-relaxed text-blue-50">
              Join thousands of businesses using Wpay to accept payments, manage transactions, and grow revenue globally.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-[17px] text-blue-50">Get started in 5 minutes</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-[17px] text-blue-50">No setup or monthly fees</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-[17px] text-blue-50">24/7 customer support</span>
              </div>
            </div>
          </div>

          {/* Footer - Bottom Left */}
          <div className="absolute bottom-12 left-16">
            <p className="text-sm text-blue-100">© 2026 Wpay</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Signup Form */}
      <div className="flex w-full items-center justify-center bg-white p-6 lg:w-1/2 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
              <span className="text-2xl font-semibold text-white">W</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-800">Join Wpay</h1>
            <p className="text-sm font-normal text-gray-600">Create your merchant account</p>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-medium text-gray-900">Create Account</h2>
            <p className="mt-2 font-normal text-gray-600">Fill in your business details to get started</p>
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Business Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Business Name
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                <Building2 className="h-5 w-5 shrink-0 text-gray-400" />
                <input
                  value={form.businessName}
                  onChange={(e) => updateField("businessName", e.target.value)}
                  placeholder="Your Business LLC"
                  className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                  required
                />
              </div>
            </div>

            {/* Owner Name & Email */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Owner Name
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                  <User className="h-5 w-5 shrink-0 text-gray-400" />
                  <input
                    value={form.ownerName}
                    onChange={(e) => updateField("ownerName", e.target.value)}
                    placeholder="John Doe"
                    className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                  <Mail className="h-5 w-5 shrink-0 text-gray-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="you@business.com"
                    className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Phone & Business Type */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                  <Phone className="h-5 w-5 shrink-0 text-gray-400" />
                  <input
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Business Type
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                  <Briefcase className="h-5 w-5 shrink-0 text-gray-400" />
                  <select
                    value={form.businessType}
                    onChange={(e) => updateField("businessType", e.target.value)}
                    className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none"
                  >
                    <option>Online Business</option>
                    <option>Service Provider</option>
                    <option>Retail Store</option>
                    <option>Agency</option>
                    <option>Education</option>
                    <option>Other</option>
                  </select>
                </div>
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
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  className="w-full border-0 bg-transparent p-0 font-normal text-gray-900 outline-none placeholder:text-gray-400"
                  required
                />
              </div>
            </div>

            {/* Error */}
            {message && !success && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-normal text-red-700">
                {message}
              </div>
            )}

            {/* Submit */}
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
                    Creating Account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Footer Link */}
          <div className="mt-8 text-center text-sm">
            <span className="font-normal text-gray-600">Already have an account? </span>
            <Link href="/" className="font-medium text-blue-600 transition hover:text-blue-700">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
