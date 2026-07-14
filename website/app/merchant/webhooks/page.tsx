"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Webhook,
} from "lucide-react";

type WebhookSettings = {
  payinWebhookUrl: string;
  payoutWebhookUrl: string;
  webhookSecret: string;
  successRedirectUrl: string;
  failedRedirectUrl: string;
  ipWhitelist: string[];
  ipWhitelistCount: number;
  ipWhitelistLimit: number;
};

const emptySettings: WebhookSettings = {
  payinWebhookUrl: "",
  payoutWebhookUrl: "",
  webhookSecret: "",
  successRedirectUrl: "",
  failedRedirectUrl: "",
  ipWhitelist: [],
  ipWhitelistCount: 0,
  ipWhitelistLimit: 5,
};

const samplePayload = `{
  "event": "payment.success",
  "brand": "Wpay",
  "success": true,
  "status": "SUCCESS",
  "merchantOrderId": "ORDER-1001",
  "linkId": "plink_5884196795ef6e6f",
  "transactionId": "GP1782653099FADA2E",
  "amount": 1000,
  "currency": "INR",
  "gateway": "Wpay",
  "utr": "601321087819",
  "timestamp": "2026-06-28T15:00:00.000Z"
}`;

export default function MerchantWebhooksPage() {
  const [settings, setSettings] = useState<WebhookSettings>(emptySettings);
  const [ipDraft, setIpDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [testResponse, setTestResponse] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/merchant/webhook-settings", {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Failed to load webhook settings");
        }
        setSettings({ ...emptySettings, ...json.settings });
        setIpDraft((json.settings.ipWhitelist || []).join("\n"));
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Failed to load webhook settings",
        });
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const ipEntries = useMemo(
    () =>
      ipDraft
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 6),
    [ipDraft]
  );
  const ipLimit = settings.ipWhitelistLimit || 5;
  const ipCount = Math.min(ipEntries.length, ipLimit);
  const overLimit = ipEntries.length > ipLimit;

  function update<K extends keyof WebhookSettings>(key: K, value: WebhookSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function copy(text: string, label: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function save(options: { rotateSecret?: boolean } = {}) {
    setSaving(true);
    setMessage(null);
    setTestResponse("");

    try {
      const res = await fetch("/api/merchant/webhook-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          payinWebhookUrl: settings.payinWebhookUrl,
          payoutWebhookUrl: settings.payoutWebhookUrl,
          successRedirectUrl: settings.successRedirectUrl,
          failedRedirectUrl: settings.failedRedirectUrl,
          ipWhitelist: ipEntries.slice(0, ipLimit),
          rotateSecret: options.rotateSecret === true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save webhook settings");
      }
      setSettings({ ...emptySettings, ...json.settings });
      setIpDraft((json.settings.ipWhitelist || []).join("\n"));
      setMessage({
        tone: "success",
        text: options.rotateSecret ? "Webhook secret rotated and saved." : "Webhook settings saved.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to save webhook settings",
      });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    setTestResponse("");

    try {
      const res = await fetch("/api/merchant/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "Merchant webhook test", amount: 100 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Webhook test failed");
      }
      setTestResponse(JSON.stringify(json.delivery || json, null, 2));
      setMessage({ tone: "success", text: "Test webhook delivered successfully." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Webhook test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <main className="merchant-page min-h-screen bg-gray-50 px-5 py-7 text-gray-900 md:px-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
          Loading webhook settings...
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
              Secure callbacks
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Webhooks, redirects and IP whitelisting
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-600">
              Configure merchant-owned callback endpoints. Wpay sends signed
              payment events to your server and uses redirect links only for customer experience.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/merchant/integration-guide#webhooks"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Integration guide
            </Link>
            <button
              type="button"
              onClick={() => save()}
              disabled={saving || overLimit}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving" : "Save settings"}
            </button>
          </div>
        </header>

        {message ? (
          <div
            className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-bold ${
              message.tone === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : "border-red-400/20 bg-red-400/10 text-red-100"
            }`}
          >
            {message.tone === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            {message.text}
          </div>
        ) : null}

        {copied ? (
          <div className="mb-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">
            Copied {copied}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <Panel>
            <SectionTitle icon={<Webhook className="h-5 w-5" />} title="Callback endpoints" text="Use HTTPS URLs owned by your server." />

            <div className="mt-6 grid gap-4">
              <Field
                label="Pay-in webhook URL"
                value={settings.payinWebhookUrl}
                placeholder="https://merchant.example.com/Wpay/payments"
                onChange={(value) => update("payinWebhookUrl", value)}
              />
              <Field
                label="Payout webhook URL"
                value={settings.payoutWebhookUrl}
                placeholder="https://merchant.example.com/Wpay/payouts"
                onChange={(value) => update("payoutWebhookUrl", value)}
              />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field
                label="Customer success link"
                value={settings.successRedirectUrl}
                placeholder="https://merchant.example.com/payment/success"
                onChange={(value) => update("successRedirectUrl", value)}
              />
              <Field
                label="Customer failed link"
                value={settings.failedRedirectUrl}
                placeholder="https://merchant.example.com/payment/failed"
                onChange={(value) => update("failedRedirectUrl", value)}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              Redirect URLs are not proof of payment. Mark orders paid only after
              verifying the signed webhook or checking status from your backend.
            </div>
          </Panel>

          <Panel>
            <SectionTitle icon={<KeyRound className="h-5 w-5" />} title="Signing secret" text="Every webhook is signed with HMAC SHA-256." />

            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                X-Wpay-Signature secret
              </p>
              <code className="mt-3 block break-all text-sm font-bold text-gray-900">
                {settings.webhookSecret || "Not generated"}
              </code>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => copy(settings.webhookSecret, "webhook secret")}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-black text-gray-900 hover:bg-gray-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => save({ rotateSecret: true })}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-900 hover:bg-amber-100 disabled:opacity-45"
                >
                  <RotateCcw className="h-4 w-4" />
                  Rotate secret
                </button>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={sendTest}
                disabled={testing || !settings.payinWebhookUrl}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-4 w-4" />
                {testing ? "Sending test webhook" : "Send test pay-in webhook"}
              </button>
              {!settings.payinWebhookUrl ? (
                <p className="mt-2 text-xs font-semibold text-gray-500">
                  Add and save a pay-in webhook URL before sending a test.
                </p>
              ) : null}
            </div>

            {testResponse ? <CodeBlock title="Latest test response" code={testResponse} /> : null}
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div id="ip-whitelist">
          <Panel>
            <SectionTitle icon={<ShieldCheck className="h-5 w-5" />} title="API IP whitelist" text="Restrict API-key calls to known backend servers." />
            <label className="mt-6 block">
              <span className="text-sm font-black text-gray-900">
                Allowed IPs <span className={overLimit ? "text-red-600" : "text-gray-500"}>({ipCount}/{ipLimit})</span>
              </span>
              <textarea
                value={ipDraft}
                onChange={(event) => setIpDraft(event.target.value)}
                rows={7}
                placeholder={"107.22.87.86\n203.0.113.10\n198.51.100.0/24"}
                className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm font-bold text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-blue-600"
              />
            </label>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Leave empty to allow all IPs. When entries are configured, Bearer
              API calls for payment links, payouts and status APIs must originate
              from one of these addresses. CIDR ranges are supported.
            </p>
            {overLimit ? (
              <p className="mt-3 text-sm font-bold text-red-600">Remove extra entries. Maximum allowed is 5.</p>
            ) : null}
          </Panel>
          </div>

          <Panel>
            <SectionTitle icon={<Webhook className="h-5 w-5" />} title="Payload and verification" text="Use the raw request body for signature checks." />
            <CodeBlock title="Webhook headers" code={`Content-Type: application/json
User-Agent: Wpay-Merchant-Webhook/1.0
X-Wpay-Signature: <hmac_sha256_hex>`} />
            <CodeBlock title="Payment success payload" code={samplePayload} />
            <CodeBlock
              title="Node.js verification"
              code={`import crypto from "crypto";

function verifyWpayWebhook(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`}
            />
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        {icon}
      </span>
      <div>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">{text}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-gray-900">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-blue-600"
      />
    </label>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
        {title}
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6 text-gray-900">
        <code>{code}</code>
      </pre>
    </div>
  );
}
