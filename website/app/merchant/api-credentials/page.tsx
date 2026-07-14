"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { authHeaders } from "@/lib/clientAuth";

type MerchantCredentials = {
  merchantId: string;
  businessName?: string;
  merchantKey?: string;
  apiKey?: string;
  secretKey?: string;
  payinApiKey?: string;
  payoutApiKey?: string;
  payinMerchantKey?: string;
  payoutMerchantKey?: string;
  status?: string;
};

type CredentialsResponse = {
  success: boolean;
  credentials?: MerchantCredentials;
  merchant?: MerchantCredentials;
  message?: string;
};

const apiBase = "https://www.sinzouae.com/api";

export default function MerchantApiCredentialsPage() {
  const [data, setData] = useState<CredentialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    async function loadCredentials() {
      try {
        const res = await fetch("/api/merchant/api-credentials", {
          credentials: "include",
          cache: "no-store",
          headers: authHeaders(),
        });
        const json = await res.json();
        setData(json);
      } catch {
        setData({ success: false, message: "Failed to load credentials" });
      } finally {
        setLoading(false);
      }
    }

    void loadCredentials();
  }, []);

  const credentials = data?.credentials || data?.merchant;
  const WpayApiKey = credentials?.apiKey || credentials?.payinApiKey || credentials?.merchantKey || "";
  const WpayMerchantKey = credentials?.merchantKey || credentials?.payinMerchantKey || "";
  const payoutApiKey = credentials?.payoutApiKey || WpayApiKey;

  const authHeader = useMemo(
    () => `Authorization: Bearer ${WpayApiKey || "YOUR_Wpay_API_KEY"}`,
    [WpayApiKey]
  );

  async function copy(text: string, label: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  if (loading) {
    return (
      <main className="merchant-page min-h-screen bg-gray-50 px-5 py-7 text-gray-900 md:px-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
          Loading Wpay API credentials...
        </div>
      </main>
    );
  }

  if (!data?.success || !credentials) {
    return (
      <main className="merchant-page min-h-screen bg-gray-50 px-5 py-7 text-gray-900 md:px-8">
        <div className="mx-auto max-w-[1100px] rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-2xl font-black text-red-900">API credentials not available</h1>
          <p className="mt-3 text-sm leading-6 text-red-800">
            {data?.message || "Your merchant account does not have Wpay API credentials yet."}
          </p>
          <p className="mt-2 text-sm leading-6 text-red-700">
            Contact Wpay support or refresh this page after your merchant account is activated.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="merchant-page min-h-screen bg-gray-50 px-5 py-7 text-gray-900 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-600">
              Wpay mediator credentials
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Pay-in and payout API access
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-600">
              Use these Wpay-issued credentials from your backend server. We
              route payments and payouts internally as a mediator, so gateway MIDs,
              upstream provider keys and routing IDs are never required in your system.
            </p>
          </div>

          <Link
            href="/merchant/integration-guide"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Integration guide
          </Link>
        </header>

        {copied ? (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
            Copied {copied}
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-3">
          <CredentialCard
            label="Merchant ID"
            value={credentials.merchantId}
            description="Your Wpay merchant account identifier."
            onCopy={() => copy(credentials.merchantId, "Merchant ID")}
          />
          <CredentialCard
            label="Pay-in API Key"
            value={WpayApiKey}
            description="Bearer token for payment links, pay-in status and merchant API calls."
            onCopy={() => copy(WpayApiKey, "Pay-in API Key")}
          />
          <CredentialCard
            label="Payout API Key"
            value={payoutApiKey}
            description="Bearer token for payout request and payout status APIs."
            onCopy={() => copy(payoutApiKey, "Payout API Key")}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Credential details</h2>
                <p className="mt-1 text-sm text-gray-600">
                  These are Wpay credentials only.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <Detail label="Business name" value={credentials.businessName || "-"} />
              <Detail label="Account status" value={credentials.status || "-"} />
              <SecretDetail
                show={showSecret}
                value={credentials.secretKey || ""}
                onToggle={() => setShowSecret((current) => !current)}
                onCopy={() => copy(credentials.secretKey || "", "Secret Key")}
              />
              <Detail label="Merchant key" value={WpayMerchantKey || "-"} copy={() => copy(WpayMerchantKey, "Merchant Key")} />
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              Keep these values on your server. Do not place API keys in frontend
              JavaScript, mobile apps, browser storage, or public repositories.
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">How to use</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Use the same Wpay authorization style for pay-in and payout. The
              routing behind it is handled by Wpay.
            </p>

            <CodeBlock title="Authorization header" code={authHeader} />
            <CodeBlock
              title="Create pay-in payment link"
              code={`curl --location '${apiBase}/payment-links' \\
  --header '${authHeader}' \\
  --header 'Content-Type: application/json' \\
  --data-raw '{
    "title": "ORDER-1001",
    "amount": 1000,
    "currency": "INR",
    "notifyUrl": "https://merchant.example.com/Wpay/webhook"
  }'`}
            />
            <CodeBlock
              title="Create payout request"
              code={`curl --location '${apiBase}/merchant/payouts' \\
  --header '${authHeader}' \\
  --header 'Content-Type: application/json' \\
  --data-raw '{
    "amount": 1500,
    "beneficiaryName": "Beneficiary Name",
    "accountNumber": "123456789012",
    "ifsc": "HDFC0001234",
    "bankName": "HDFC Bank",
    "beneficiaryMobile": "9876543210"
  }'`}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function CredentialCard({
  label,
  value,
  description,
  onCopy,
}: {
  label: string;
  value?: string;
  description: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <code className="mt-4 block break-all rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-900">
        {value || "Not generated"}
      </code>
      <p className="mt-3 min-h-12 text-sm leading-6 text-gray-600">{description}</p>
      <button
        onClick={onCopy}
        disabled={!value}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Copy className="h-4 w-4" />
        Copy
      </button>
    </div>
  );
}

function Detail({ label, value, copy }: { label: string; value: string; copy?: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <code className="break-all text-sm font-bold text-gray-900">{value}</code>
        {copy ? (
          <button onClick={copy} className="shrink-0 text-sm font-black text-blue-600 hover:text-blue-700">
            Copy
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SecretDetail({
  show,
  value,
  onToggle,
  onCopy,
}: {
  show: boolean;
  value: string;
  onToggle: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Secret key</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <code className="break-all text-sm font-bold text-gray-900">
          {show ? value || "Not generated" : "••••••••••••••••••••••••"}
        </code>
        <div className="flex shrink-0 gap-3">
          <button onClick={onToggle} className="text-blue-600 hover:text-blue-700">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button onClick={onCopy} className="text-sm font-black text-blue-600 hover:text-blue-700">
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-black text-blue-600">{title}</p>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6 text-gray-900">
        <code>{code}</code>
      </pre>
    </div>
  );
}
