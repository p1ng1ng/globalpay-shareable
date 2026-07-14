"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CreditCard,
  KeyRound,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Webhook,
} from "lucide-react";

const baseUrl = "https://www.sinzouae.com";

const sections = [
  { href: "#overview", label: "Overview" },
  { href: "#credentials", label: "Credentials" },
  { href: "#payin", label: "Pay-in" },
  { href: "#status", label: "Status" },
  { href: "#webhooks", label: "Webhooks" },
  { href: "#ip-whitelist", label: "IP whitelist" },
  { href: "#payouts", label: "Payouts" },
  { href: "#errors", label: "Errors" },
  { href: "#checklist", label: "Go live" },
];

export default function MerchantIntegrationGuidePage() {
  return (
    <main className="merchant-page min-h-screen bg-gray-50 px-5 py-7 text-gray-900 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-600">
              Wpay merchant documentation
            </p>
            <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-4xl">
              Integrate collections, payment pages, callbacks and payouts
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-600">
              This page documents only the Wpay merchant-facing API. Internal
              gateway names, routing rules, MID pool IDs and provider MIDs are not
              required for merchant integration and are intentionally not exposed.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/merchant/api-credentials"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
            >
              <KeyRound className="h-4 w-4" />
              API credentials
            </Link>
            <Link
              href="/merchant/webhooks"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-900 hover:bg-gray-50"
            >
              <Webhook className="h-4 w-4" />
              Webhooks
            </Link>
          </div>
        </header>

        <nav className="sticky top-[86px] z-20 mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
          {sections.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <section id="overview" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <BookOpen className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">How Wpay works</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Your system talks to Wpay. Wpay handles routing internally.
                </p>
              </div>
            </div>

            <ol className="mt-6 space-y-4 text-sm leading-6 text-gray-700">
              <li><Step value="1" />Create a payment link from your server using your Wpay API key.</li>
              <li><Step value="2" />Send the customer to the returned Wpay payment URL.</li>
              <li><Step value="3" />Customer completes payment on the Wpay paybook page.</li>
              <li><Step value="4" />Wpay sends a signed callback to your configured webhook URL.</li>
              <li><Step value="5" />Your server verifies the signature and marks the order paid.</li>
            </ol>

            <Notice tone="blue">
              Do not build against provider URLs, gateway callbacks, MID values or
              routing identifiers. They can change without notice. Your stable
              contract is the Wpay API, Wpay payment URL and Wpay webhook.
            </Notice>
          </Panel>

          <Panel>
            <h2 className="text-2xl font-black">Base URLs</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Info label="Production API" value={`${baseUrl}/api`} />
              <Info label="Customer pay page" value={`${baseUrl}/pay/{linkId}`} />
              <Info label="Merchant dashboard" value={`${baseUrl}/merchant/dashboard`} />
              <Info label="Admin-free merchant testing" value="Use your own merchant login and API key" />
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-black text-emerald-700">Merchant-facing identifiers</p>
              <p className="mt-2 text-sm leading-6 text-emerald-900">
                You will use only `merchantId`, `apiKey` or `merchantKey`,
                `secretKey`, `linkId`, `transactionId`, `payoutId` and `utr`.
                Upstream MID data is internal and never needed by your integration.
              </p>
            </div>
          </Panel>
        </section>

        <section id="credentials" className="mt-6">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <LockKeyhole className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">Credentials and security</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Keep credentials on your server. Never expose them in browser code.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Info label="API key / Merchant key" value="Bearer token for server API calls" />
              <Info label="Merchant secret key" value="Account-level secret. Do not use as Bearer token." />
              <Info label="Webhook signing secret" value="Used only to verify X-Wpay-Signature" />
            </div>

            <CodeBlock
              title="Required headers"
              code={`Authorization: Bearer YOUR_Wpay_API_KEY
Content-Type: application/json`}
            />

            <CodeBlock
              title="Credential usage"
              code={`API Key / Merchant Key
- Location: Dashboard > API Credentials
- Format: gp_live_...
- Usage: Authorization: Bearer YOUR_Wpay_API_KEY

Merchant Secret Key
- Location: Dashboard > API Credentials
- Format: gp_secret_...
- Usage: advanced server-side merchant operations only
- Do not use as the Bearer token

Webhook Signing Secret
- Location: Dashboard > Webhooks
- Usage: verify X-Wpay-Signature on callbacks
- Per-link callbackSecret overrides the merchant default`}
            />

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Checklist
                title="Do"
                items={[
                  "Call APIs from your backend server.",
                  "Store credentials in environment variables.",
                  "Add your server IPs in Webhooks > IP Whitelisting before production.",
                  "Use HTTPS callback and redirect URLs.",
                  "Verify `X-Wpay-Signature` before updating orders.",
                ]}
              />
              <Checklist
                title="Do not"
                items={[
                  "Do not expose API keys in mobile or browser JavaScript.",
                  "Do not use a secret key as the Bearer token.",
                  "Do not depend on gateway names, MID IDs or routing IDs.",
                  "Do not mark orders paid only from browser redirects.",
                  "Do not whitelist browser, office or customer IPs for server API access.",
                ]}
              />
            </div>
          </Panel>
        </section>

        <section id="payin" className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <CreditCard className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">Create a payment link</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Create the order from your server, then redirect the customer to Wpay.
                </p>
              </div>
            </div>

            <Endpoint method="POST" path="/api/payment-links" />

            <CodeBlock
              title="Request body"
              code={`{
  "title": "ORDER-1001",
  "amount": 1000,
  "currency": "INR",
  "customerName": "Aarav Mehta",
  "customerEmail": "customer@example.com",
  "notifyUrl": "https://merchant.example.com/Wpay/webhook",
  "callbackSecret": "your-per-link-webhook-secret",
  "successRedirectUrl": "https://merchant.example.com/payment-success",
  "failedRedirectUrl": "https://merchant.example.com/payment-failed"
}`}
            />

            <Notice tone="blue">
              `notifyUrl`, `callbackSecret`, `successRedirectUrl` and
              `failedRedirectUrl` are optional when you have saved defaults in
              Webhooks. Per-link values override the merchant defaults.
            </Notice>

            <CodeBlock
              title="cURL"
              code={`curl --location '${baseUrl}/api/payment-links' \\
  --header 'Authorization: Bearer YOUR_Wpay_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data-raw '{
    "title": "ORDER-1001",
    "amount": 1000,
    "currency": "INR",
    "customerName": "Aarav Mehta",
    "customerEmail": "customer@example.com",
    "notifyUrl": "https://merchant.example.com/Wpay/webhook",
    "successRedirectUrl": "https://merchant.example.com/payment-success",
    "failedRedirectUrl": "https://merchant.example.com/payment-failed"
  }'`}
            />
          </Panel>

          <Panel>
            <h2 className="text-2xl font-black">Payment link response</h2>
            <CodeBlock
              title="Success response"
              code={`{
  "success": true,
  "message": "Payment link created",
  "paymentLink": {
    "linkId": "plink_5884196795ef6e6f",
    "merchantEmail": "merchant@example.com",
    "title": "ORDER-1001",
    "amount": 1000,
    "currency": "INR",
    "status": "active",
    "notifyUrl": "https://merchant.example.com/Wpay/webhook",
    "callbackSecret": "your-per-link-webhook-secret"
  }
}`}
            />

            <CodeBlock
              title="Customer URL"
              code={`${baseUrl}/pay/{linkId}`}
            />

            <Notice tone="amber">
              Browser redirect URLs are for customer experience only. Always use
              the signed webhook or authenticated API status data as your source of truth.
            </Notice>

            <div className="mt-5 grid gap-3">
              <MiniStep title="Active" text="Link is ready for customer payment." />
              <MiniStep title="Pending transaction" text="Customer opened payment and a transaction was created." />
              <MiniStep title="Paid" text="Wpay confirmed payment and sent callback." />
              <MiniStep title="Failed" text="Payment failed, expired or was rejected." />
            </div>
          </Panel>
        </section>

        <section id="status" className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <RefreshCcw className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">Payment link status</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Use status checks and signed webhooks as your source of truth.
                </p>
              </div>
            </div>

            <Endpoint method="GET" path="/api/payment-links/{linkId}/status" />
            <CodeBlock
              title="Check status"
              code={`curl --location '${baseUrl}/api/payment-links/plink_xxxxx/status' \\
  --header 'Authorization: Bearer YOUR_Wpay_API_KEY'`}
            />

            <CodeBlock
              title="Status response"
              code={`{
  "success": true,
  "paid": true,
  "status": "paid",
  "paymentLink": {
    "linkId": "plink_xxxxx",
    "status": "paid",
    "amount": 1000,
    "currency": "INR",
    "transactionId": "GP1782653099FADA2E",
    "utr": "601321087819",
    "paidAt": "2026-06-30T08:00:00.000Z",
    "expiresAt": "2026-06-30T08:15:00.000Z"
  }
}`}
            />
          </Panel>

          <Panel>
            <h2 className="text-2xl font-black">Status and expiration rules</h2>
            <div className="mt-5 grid gap-3">
              <MiniStep title="active" text="Payment link is created and available for the customer." />
              <MiniStep title="pending_transaction" text="Customer opened the payment flow and a gateway-specific payment intent is active. RockyPayz intents expire after 5 minutes." />
              <MiniStep title="paid" text="Payment is confirmed. The link is closed and callbacks are sent." />
              <MiniStep title="failed" text="Payment failed, expired or was rejected. Create a fresh link for a new attempt." />
              <MiniStep title="expired" text="Reserved for custom link expiry. Current payment intents expire based on the selected gateway, and stale unpaid links are failed after 30 minutes." />
            </div>

            <Notice tone="amber">
              Customer redirects are not proof of payment. Mark orders paid only
              after a signed webhook or a successful authenticated status check.
            </Notice>
          </Panel>
        </section>

        <section id="webhooks" className="mt-6">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <Webhook className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">Payment callbacks</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Wpay posts payment results to your saved webhook URL or per-link `notifyUrl`.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div>
                <CodeBlock
                  title="Configure defaults"
                  code={`PATCH ${baseUrl}/api/merchant/webhook-settings

{
  "payinWebhookUrl": "https://merchant.example.com/Wpay/payments",
  "payoutWebhookUrl": "https://merchant.example.com/Wpay/payouts",
  "successRedirectUrl": "https://merchant.example.com/payment-success",
  "failedRedirectUrl": "https://merchant.example.com/payment-failed",
  "ipWhitelist": ["107.22.87.86"]
}`}
                />

                <CodeBlock
                  title="Webhook headers"
                  code={`Content-Type: application/json
User-Agent: Wpay-Merchant-Webhook/1.0
X-Wpay-Signature: hmac_sha256_signature`}
                />

                <CodeBlock
                  title="Payment success payload"
                  code={`{
  "event": "payment.success",
  "brand": "Wpay",
  "success": true,
  "status": "SUCCESS",
  "message": "Payment successful",
  "merchantOrderId": "ORDER-1001",
  "linkId": "plink_5884196795ef6e6f",
  "paymentLinkId": "plink_5884196795ef6e6f",
  "merchantEmail": "merchant@example.com",
  "transactionId": "GP1782653099FADA2E",
  "amount": 1000,
  "currency": "INR",
  "gateway": "Wpay",
  "utr": "601321087819",
  "customerName": "Aarav Mehta",
  "customerEmail": "customer@example.com",
  "timestamp": "2026-06-28T15:00:00.000Z"
}`}
                />
              </div>

              <div>
                <CodeBlock
                  title="Node.js signature verification"
                  code={`import crypto from "crypto";

function verifyWpayWebhook(rawBody, signature, callbackSecret) {
  const expected = crypto
    .createHmac("sha256", callbackSecret)
    .update(rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`}
                />

                <Notice tone="blue">
                  Verify the signature against the exact raw request body. Parse JSON only
                  after the signature passes. Your endpoint should return HTTP 2xx after
                  safely recording the event.
                </Notice>

                <CodeBlock
                  title="Delivery and retry policy"
                  code={`Success criteria
- HTTP status: any 2xx response
- Response time: within 5 seconds

Retry schedule
- Attempt 1: immediate
- Attempt 2: after 5 minutes
- Attempt 3: after 15 minutes
- Attempt 4: after 1 hour
- Attempt 5: after 6 hours

Failure handling
- 2xx: delivered, no retry
- 4xx, 5xx, timeout or connection failure: retry scheduled
- Final failure remains visible in webhook logs and can be retried manually`}
                />

                <div className="mt-5 grid gap-3">
                  <MiniStep title="Idempotency" text="Use `transactionId` or `linkId` to ignore duplicate callbacks." />
                  <MiniStep title="Order matching" text="Match `merchantOrderId` to your internal order ID." />
                  <MiniStep title="Amount check" text="Verify amount and currency before marking paid." />
                  <MiniStep title="No MID dependency" text="Callbacks carry Wpay references only." />
                </div>
              </div>
            </div>
          </Panel>
        </section>

        <section id="ip-whitelist" className="mt-6">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <ShieldCheck className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">IP whitelisting</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Restrict Bearer API-key calls to your known backend servers.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div>
                <p className="text-sm leading-6 text-slate-300">
                  Configure up to 5 IP entries from the Webhooks page. Entries can
                  be exact IPv4/IPv6 addresses or CIDR ranges. When the list is
                  empty, API-key access is not IP restricted.
                </p>
                <Notice tone="amber">
                  Whitelist backend server egress IPs only. Do not whitelist
                  customer devices, browsers, office networks or VPNs unless your
                  API requests genuinely originate there.
                </Notice>
              </div>
              <div>
                <CodeBlock
                  title="Save whitelist"
                  code={`curl --location --request PATCH '${baseUrl}/api/merchant/webhook-settings' \\
  --header 'Authorization: Bearer YOUR_Wpay_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data-raw '{
    "ipWhitelist": [
      "107.22.87.86",
      "203.0.113.10",
      "198.51.100.0/24"
    ]
  }'`}
                />
              </div>
            </div>
          </Panel>
        </section>

        <section id="payouts" className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <RefreshCcw className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">Payout requests</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Merchants request payouts; Wpay submits every valid request directly to the assigned provider route.
                </p>
              </div>
            </div>

            <Endpoint method="POST" path="/api/merchant/payouts" />
            <CodeBlock
              title="Payout request body"
              code={`{
  "amount": 1500,
  "beneficiaryName": "Beneficiary Name",
  "accountNumber": "123456789012",
  "ifsc": "HDFC0001234",
  "bankName": "HDFC Bank",
  "beneficiaryMobile": "9876543210",
  "note": "Settlement for ORDER batch 24"
}`}
            />

            <CodeBlock
              title="Payout response"
              code={`{
  "success": true,
  "message": "Payout submitted to rockypayz",
  "selectedGateway": "rockypayz",
  "payout": {
    "payoutId": "pout_1782660000_a1b2c3d4",
    "amount": 1500,
    "currency": "INR",
    "status": "processing",
    "provider": "rockypayz",
    "providerTxnId": "pout_1782660000_a1b2c3d4",
    "utr": ""
  },
  "providerResponse": {}
}`}
            />
          </Panel>

          <Panel>
            <h2 className="text-2xl font-black">Payout status</h2>
            <Endpoint method="GET" path="/api/merchant/payouts" />
            <Endpoint method="POST" path="/api/merchant/payouts/status" />

            <CodeBlock
              title="Refresh one payout"
              code={`curl --location '${baseUrl}/api/merchant/payouts/status' \\
  --header 'Authorization: Bearer YOUR_Wpay_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data-raw '{
    "payoutId": "pout_1782660000_a1b2c3d4"
  }'`}
            />

            <div className="mt-5 grid gap-3">
              <MiniStep title="pending" text="Request accepted and being prepared for provider submission." />
              <MiniStep title="processing" text="Submitted for bank transfer and waiting for final result." />
              <MiniStep title="paid" text="Transfer succeeded. UTR is available." />
              <MiniStep title="failed" text="Transfer failed or was rejected. Contact support if unclear." />
            </div>

            <CodeBlock
              title="Payout webhook payload"
              code={`{
  "event": "payout.success",
  "brand": "Wpay",
  "success": true,
  "status": "SUCCESS",
  "payoutId": "pout_1782660000_a1b2c3d4",
  "merchantEmail": "merchant@example.com",
  "amount": 1500,
  "currency": "INR",
  "gateway": "Wpay",
  "utr": "601321087819",
  "beneficiaryName": "Beneficiary Name",
  "timestamp": "2026-06-28T15:00:00.000Z"
}`}
            />

            <Notice tone="amber">
              Payout routing is controlled by Wpay.
              Merchants do not need provider credentials, route numbers or MID details.
            </Notice>
          </Panel>
        </section>

        <section id="errors" className="mt-6">
          <Panel>
            <h2 className="text-2xl font-black">Errors and required handling</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ErrorBox code="400" title="Bad request" text="Missing required fields or invalid amount/mobile/IFSC." />
              <ErrorBox code="401" title="Unauthorized" text="Missing or invalid Bearer API key." />
              <ErrorBox code="403" title="Access denied" text="Credential is valid but not allowed for that resource." />
              <ErrorBox code="409" title="Conflict" text="Duplicate request, already-paid link or invalid state transition." />
            </div>

            <CodeBlock
              title="Structured error response"
              code={`{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "Amount must be between Rs. 1 and Rs. 100,000",
    "field": "amount"
  }
}`}
            />

            <CodeBlock
              title="Common error codes"
              code={`400 INVALID_AMOUNT       Amount validation failed
400 MISSING_FIELD        Required field missing
400 INVALID_MOBILE       Mobile format invalid
400 INVALID_IFSC         IFSC format invalid
401 INVALID_API_KEY      API key invalid
403 IP_NOT_WHITELISTED   Request IP is not allowed
409 DUPLICATE_ORDER      Order already processed
429 RATE_LIMIT_EXCEEDED  Too many requests
500 INTERNAL_ERROR       Server error`}
            />
          </Panel>
        </section>

        <section id="checklist" className="mt-6">
          <Panel>
            <div className="flex items-center gap-3">
              <IconBox>
                <ShieldCheck className="h-5 w-5" />
              </IconBox>
              <div>
                <h2 className="text-2xl font-black">Go-live checklist</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Complete these before moving real customer volume.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Checklist
                title="Technical"
                items={[
                  "Payment link creation works from your backend.",
                  "Customer redirect opens the Wpay pay page.",
                  "Webhook endpoint accepts only HTTPS traffic.",
                  "Signature verification is implemented using raw body.",
                  "Duplicate callback handling is idempotent.",
                  "Order amount and currency are validated before marking paid.",
                ]}
              />
              <Checklist
                title="Operations"
                items={[
                  "API key is stored in server environment variables.",
                  "Merchant account is active in Wpay.",
                  "Support has confirmed payout limits and settlement timing.",
                  "Your finance team understands pending, processing, paid and failed statuses.",
                  "No upstream gateway MID or routing identifier is stored in your system.",
                  "A small live test has been reconciled end to end.",
                ]}
              />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {children}
    </section>
  );
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
      {children}
    </span>
  );
}

function Step({ value }: { value: string }) {
  return (
    <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
      {value}
    </span>
  );
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center">
      <span className="w-fit rounded-lg bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
        {method}
      </span>
      <code className="break-all text-sm font-bold text-gray-900">
        {baseUrl}{path}
      </code>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="mt-3 break-words text-sm font-bold leading-6 text-gray-900">{value}</p>
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

function Notice({ children, tone }: { children: React.ReactNode; tone: "blue" | "amber" }) {
  const color =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`mt-5 rounded-2xl border p-4 text-sm font-semibold leading-6 ${color}`}>
      {children}
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <h3 className="font-black text-gray-900">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-gray-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      <div>
        <p className="font-black text-gray-900">{title}</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">{text}</p>
      </div>
    </div>
  );
}

function ErrorBox({ code, title, text }: { code: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-2xl font-black text-red-600">{code}</p>
      <p className="mt-2 font-black text-gray-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}
