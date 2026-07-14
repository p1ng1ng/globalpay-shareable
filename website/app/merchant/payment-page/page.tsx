"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImageIcon,
  LockKeyhole,
  Palette,
  QrCode,
  RefreshCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  defaultPaybookSettings,
  isSupportedLogoImageUrl,
  serializePaybookSettings,
  type PaybookSettings,
  type PaybookThemeMode,
} from "@/lib/paybook-settings";
import styles from "./payment-page.module.css";

type PreviewStage = "checkout" | "payment" | "success";
type MessageType = "success" | "error";

type CopyField = {
  key: keyof PaybookSettings;
  label: string;
  placeholder: string;
};

const swatches = [
  "#087f5b",
  "#2563eb",
  "#7c3aed",
  "#be123c",
  "#0f766e",
  "#ca8a04",
];

const checkoutFields: CopyField[] = [
  {
    key: "protectedPaymentLabel",
    label: "Security label",
    placeholder: "Protected payment",
  },
  {
    key: "paymentRequestLabel",
    label: "Payment request label",
    placeholder: "Payment request",
  },
  {
    key: "paymentToLabel",
    label: "Payment recipient prefix",
    placeholder: "Payment to",
  },
  { key: "orderLabel", label: "Order label", placeholder: "Order" },
  {
    key: "referenceLabel",
    label: "Reference label",
    placeholder: "Reference",
  },
  {
    key: "upiPaymentLabel",
    label: "Payment method label",
    placeholder: "UPI payment",
  },
  {
    key: "checkoutTitle",
    label: "Checkout heading",
    placeholder: "Pay from any UPI app",
  },
  {
    key: "checkoutDescription",
    label: "Checkout description",
    placeholder: "Start a secure UPI payment request and complete it from your preferred app.",
  },
  {
    key: "payButtonLabel",
    label: "Pay button",
    placeholder: "Pay now",
  },
];

const paymentFields: CopyField[] = [
  {
    key: "paySecurelyLabel",
    label: "Payment step label",
    placeholder: "Pay securely",
  },
  {
    key: "desktopReadyTitle",
    label: "Desktop payment heading",
    placeholder: "Scan or continue",
  },
  {
    key: "mobileReadyTitle",
    label: "Mobile payment heading",
    placeholder: "Choose your UPI app",
  },
  {
    key: "singleUseLabel",
    label: "Payment amount label",
    placeholder: "Single-use payment",
  },
  { key: "showQrLabel", label: "Show QR button", placeholder: "Show QR" },
  {
    key: "qrVisibleLabel",
    label: "QR visible status",
    placeholder: "QR shown",
  },
  {
    key: "payWithAppLabel",
    label: "UPI app section label",
    placeholder: "Pay with an app on this phone",
  },
  {
    key: "continuePaymentLabel",
    label: "Continue button",
    placeholder: "Continue to payment",
  },
  {
    key: "checkStatusLabel",
    label: "Status button",
    placeholder: "Check status",
  },
  {
    key: "copyPaymentLabel",
    label: "Copy button",
    placeholder: "Copy payment link",
  },
];

const completionFields: CopyField[] = [
  {
    key: "successLabel",
    label: "Success step label",
    placeholder: "Payment complete",
  },
  {
    key: "successTitle",
    label: "Success heading",
    placeholder: "Payment received",
  },
  {
    key: "doneButtonLabel",
    label: "Completion button",
    placeholder: "Done",
  },
  {
    key: "footerNote",
    label: "Footer notice",
    placeholder: "Payments are subject to bank confirmation",
  },
];

const themeOptions: { value: PaybookThemeMode; label: string }[] = [
  { value: "system", label: "Device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function MerchantPaymentPage() {
  const [settings, setSettings] = useState<PaybookSettings>(
    defaultPaybookSettings
  );
  const [previewStage, setPreviewStage] =
    useState<PreviewStage>("checkout");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("success");
  const [sampleUrl, setSampleUrl] = useState("");
  const [paymeEnabled, setPaymeEnabled] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/merchant/payment-page-settings", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Settings unavailable");
        }
        return data;
      })
      .then((data) => {
        if (!active) return;
        setSettings(serializePaybookSettings(data.settings));
        setPaymeEnabled(data.paymeEnabled !== false);
        setSampleUrl(String(data.sampleUrl || ""));
      })
      .catch((error) => {
        if (!active) return;
        setMessageType("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load PayMe settings"
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof PaybookSettings>(
    key: K,
    value: PaybookSettings[K]
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isSupportedLogoImageUrl(settings.logoImageUrl)) {
      setMessageType("error");
      setMessage(
        "Logo image must be a complete HTTP or HTTPS URL ending in .png, .jpg or .jpeg."
      );
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      const response = await fetch("/api/merchant/payment-page-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...settings, paymeEnabled }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save settings");
      }

      setSettings(serializePaybookSettings(data.settings));
      setPaymeEnabled(data.paymeEnabled !== false);
      setMessageType("success");
      setMessage(
        "Payment page saved. Existing and future payment links now use this design."
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "Unable to save settings"
      );
    } finally {
      setSaving(false);
    }
  }

  async function copySample() {
    if (!sampleUrl) return;

    try {
      await navigator.clipboard.writeText(sampleUrl);
      setMessageType("success");
      setMessage("Payment page URL copied.");
    } catch {
      setMessageType("error");
      setMessage("The browser could not copy the payment page URL.");
    }
  }

  const previewTheme =
    settings.themeMode === "system" ? systemTheme : settings.themeMode;
  const logoUrlValid = isSupportedLogoImageUrl(settings.logoImageUrl);

  return (
    <main className="min-h-screen bg-[var(--gp-bg)] px-4 py-7 text-[var(--gp-text)] sm:px-6 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-5 border-b border-[var(--gp-border)] pb-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-[var(--gp-accent-2)]">
              Payment page
            </p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">
              Hosted checkout editor
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--gp-muted)]">
              Control your customer-facing logo, theme, labels, payment actions,
              and completion state. The preview updates as you type.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {sampleUrl ? (
              <>
                <button
                  type="button"
                  onClick={copySample}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel)] px-4 py-2.5 text-sm font-bold hover:bg-[var(--gp-panel-solid)]"
                >
                  <Copy className="h-4 w-4" />
                  Copy live URL
                </button>
                <a
                  href={sampleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500"
                >
                  Open payment page
                  <ExternalLink className="h-4 w-4" />
                </a>
              </>
            ) : (
              <Link
                href="/merchant/payment-links"
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500"
              >
                Create a payment link
              </Link>
            )}
          </div>
        </header>

        <div className="mt-4 min-h-8">
          {sampleUrl ? (
            <p className="truncate font-mono text-xs text-[var(--gp-muted)]">
              Live URL: {sampleUrl}
            </p>
          ) : (
            <p className="text-xs font-semibold text-amber-500">
              No active payment link exists yet. Placeholder URLs are never
              shown.
            </p>
          )}
        </div>

        {message ? (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm font-semibold ${
              messageType === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
                : "border-red-500/25 bg-red-500/10 text-red-500"
            }`}
          >
            {message}
          </div>
        ) : null}

        <section className="mt-6 grid items-start gap-6 2xl:grid-cols-[minmax(400px,0.78fr)_minmax(600px,1.22fr)]">
          <form
            onSubmit={saveSettings}
            className="overflow-hidden rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel)]"
          >
            <div className="flex items-center gap-3 border-b border-[var(--gp-border)] px-5 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500">
                <Palette className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-black">Checkout settings</h2>
                <p className="text-xs text-[var(--gp-muted)]">
                  Saved values apply to all merchant links.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4].map((item) => (
                  <span
                    key={item}
                    className="block h-12 animate-pulse rounded-lg bg-[var(--gp-border)]"
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-[var(--gp-border)]">
                <EditorSection
                  title="PayMe availability"
                  description="Choose whether API responses should prefer your hosted PayMe checkout or direct UPI intent fallback."
                  open
                >
                  <Toggle
                    label="Enable PayMe hosted checkout"
                    description={
                      paymeEnabled
                        ? "API responses include PayMe page URL, setup values and this checkout configuration."
                        : "API responses fall back to direct UPI intent plus the standard Wpay payment page URL."
                    }
                    checked={paymeEnabled}
                    onChange={setPaymeEnabled}
                  />
                  <div className="rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel-solid)] p-4 text-xs font-semibold leading-6 text-[var(--gp-muted)]">
                    {paymeEnabled
                      ? "Enabled response mode: payme, paymentPageUrl, standardPaymentPageUrl, payme settings and link identifiers."
                      : "Disabled response mode: intent, upiLink/paymentTarget/qrPayload when available, standardPaymentPageUrl and paymeSetupUrl."}
                  </div>
                </EditorSection>

                <EditorSection
                  title="Brand and appearance"
                  description="Identity, image, accent and customer theme."
                  open
                >
                  <Field
                    label="Brand name"
                    value={settings.brandName}
                    onChange={(value) => update("brandName", value)}
                    placeholder="Mandi2Mandi"
                  />
                  <Field
                    label="Subtitle"
                    value={settings.subtitle}
                    onChange={(value) => update("subtitle", value)}
                    placeholder="Secure checkout"
                  />
                  <Field
                    label="Payment recipient"
                    value={settings.vendorLabel}
                    onChange={(value) => update("vendorLabel", value)}
                    placeholder="Your store or vendor name"
                  />

                  <label className="block">
                    <span className="text-sm font-bold">Logo image URL</span>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel-solid)]">
                        {settings.logoImageUrl && logoUrlValid ? (
                          <img
                            src={settings.logoImageUrl}
                            alt="Merchant logo preview"
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-[var(--gp-muted)]" />
                        )}
                      </span>
                      <input
                        type="url"
                        value={settings.logoImageUrl}
                        onChange={(event) =>
                          update("logoImageUrl", event.target.value)
                        }
                        placeholder="https://example.com/logo.png"
                        className="h-12 min-w-0 flex-1 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel-solid)] px-4 text-sm font-semibold text-[var(--gp-text)] outline-none focus:border-blue-500"
                      />
                    </div>
                    <span
                      className={`mt-2 block text-xs ${
                        logoUrlValid ? "text-[var(--gp-muted)]" : "text-red-500"
                      }`}
                    >
                      Optional. Use a complete PNG, JPG, or JPEG URL. No logo is
                      displayed when this is empty.
                    </span>
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold">Accent color</span>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {swatches.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => update("accentColor", color)}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--gp-border)]"
                          style={{ backgroundColor: color }}
                          aria-label={`Use ${color}`}
                        >
                          {settings.accentColor === color ? (
                            <Check className="h-5 w-5 text-white" />
                          ) : null}
                        </button>
                      ))}
                      <input
                        type="color"
                        value={settings.accentColor}
                        onChange={(event) =>
                          update("accentColor", event.target.value)
                        }
                        className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--gp-border)] bg-transparent p-1"
                        aria-label="Custom accent color"
                      />
                      <span className="font-mono text-xs text-[var(--gp-muted)]">
                        {settings.accentColor}
                      </span>
                    </div>
                  </label>

                  <fieldset>
                    <legend className="text-sm font-bold">Customer theme</legend>
                    <div className="mt-2 grid grid-cols-3 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel-solid)] p-1">
                      {themeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => update("themeMode", option.value)}
                          className={`rounded-md px-3 py-2 text-sm font-bold ${
                            settings.themeMode === option.value
                              ? "bg-blue-600 text-white"
                              : "text-[var(--gp-muted)] hover:text-[var(--gp-text)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[var(--gp-muted)]">
                      Device follows the customer&apos;s operating system theme.
                    </p>
                  </fieldset>
                </EditorSection>

                <EditorSection
                  title="Checkout copy"
                  description="Labels shown before the payment starts."
                >
                  <CopyFields
                    fields={checkoutFields}
                    settings={settings}
                    update={update}
                  />
                </EditorSection>

                <EditorSection
                  title="Payment copy"
                  description="Labels shown after the UPI request is created."
                >
                  <CopyFields
                    fields={paymentFields}
                    settings={settings}
                    update={update}
                  />
                </EditorSection>

                <EditorSection
                  title="Completion and footer"
                  description="Success state, trust copy and visibility."
                >
                  <CopyFields
                    fields={completionFields}
                    settings={settings}
                    update={update}
                  />
                  <label className="block">
                    <span className="text-sm font-bold">Support / trust text</span>
                    <textarea
                      value={settings.supportText}
                      onChange={(event) =>
                        update("supportText", event.target.value)
                      }
                      className="mt-2 min-h-24 w-full rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel-solid)] px-4 py-3 text-sm font-semibold text-[var(--gp-text)] outline-none focus:border-blue-500"
                    />
                  </label>
                  <Toggle
                    label="Show order and reference"
                    description="Display payment-link title and reference ID."
                    checked={settings.showOrderDetails}
                    onChange={(checked) =>
                      update("showOrderDetails", checked)
                    }
                  />
                  <Toggle
                    label="Show support text"
                    description="Display your trust message near payment controls."
                    checked={settings.showSupportText}
                    onChange={(checked) => update("showSupportText", checked)}
                  />
                  <Toggle
                    label="Show Wpay footer"
                    description="Display the processor name below the checkout."
                    checked={settings.showPoweredBy}
                    onChange={(checked) => update("showPoweredBy", checked)}
                  />
                </EditorSection>
              </div>
            )}

            <div className="sticky bottom-0 border-t border-[var(--gp-border)] bg-[var(--gp-panel-solid)] p-4">
              <button
                disabled={saving || loading || !logoUrlValid}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Saving..." : "Save payment page"}
              </button>
            </div>
          </form>

          <section className="2xl:sticky 2xl:top-24">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">Live customer preview</h2>
                <p className="text-xs text-[var(--gp-muted)]">
                  {settings.themeMode === "system"
                    ? `Device mode currently resolves to ${systemTheme}.`
                    : `${settings.themeMode} mode is forced for every customer.`}
                </p>
              </div>
              <div className="grid grid-cols-3 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel)] p-1">
                {(["checkout", "payment", "success"] as PreviewStage[]).map(
                  (stage) => (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => setPreviewStage(stage)}
                      className={`rounded-md px-3 py-2 text-xs font-bold capitalize ${
                        previewStage === stage
                          ? "bg-blue-600 text-white"
                          : "text-[var(--gp-muted)]"
                      }`}
                    >
                      {stage}
                    </button>
                  )
                )}
              </div>
            </div>

            <PaybookPreview
              settings={settings}
              stage={previewStage}
              theme={previewTheme}
            />
            <MobileAppPreview settings={settings} theme={previewTheme} />
          </section>
        </section>
      </div>
    </main>
  );
}

function MobileAppPreview({
  settings,
  theme,
}: {
  settings: PaybookSettings;
  theme: "light" | "dark";
}) {
  return (
    <section
      className={styles.mobilePreview}
      data-preview-theme={theme}
      style={{ "--preview-accent": settings.accentColor } as React.CSSProperties}
      aria-label="Mobile UPI app preview"
    >
      <div className={styles.mobileDevice}>
        <div className={styles.mobileHandle} />
        <header className={styles.mobileHeader}>
          <span>{settings.brandName}</span>
          <strong>14:43</strong>
        </header>
        <div className={styles.mobileAmount}>
          <small>{settings.singleUseLabel}</small>
          <strong>₹4,000.00</strong>
        </div>
        <button type="button" className={styles.mobileQrButton}>
          <QrCode size={16} />
          {settings.showQrLabel}
        </button>
        <p>{settings.payWithAppLabel}</p>
        <div className={styles.mobileApps}>
          {["PhonePe", "Paytm", "Google Pay", "Other UPI"].map((app) => (
            <span key={app}>{app}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditorSection({
  title,
  description,
  open = false,
  children,
}: {
  title: string;
  description: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-black">{title}</span>
            <span className="mt-1 block text-xs text-[var(--gp-muted)]">
              {description}
            </span>
          </span>
          <span className="text-xl text-[var(--gp-muted)] group-open:rotate-45">
            +
          </span>
        </div>
      </summary>
      <div className="grid gap-4 border-t border-[var(--gp-border)] px-5 py-5">
        {children}
      </div>
    </details>
  );
}

function CopyFields({
  fields,
  settings,
  update,
}: {
  fields: CopyField[];
  settings: PaybookSettings;
  update: <K extends keyof PaybookSettings>(
    key: K,
    value: PaybookSettings[K]
  ) => void;
}) {
  return fields.map((field) => (
    <Field
      key={field.key}
      label={field.label}
      value={String(settings[field.key])}
      onChange={(value) => update(field.key, value)}
      placeholder={field.placeholder}
    />
  ));
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel-solid)] px-4 text-sm font-semibold text-[var(--gp-text)] outline-none focus:border-blue-500"
      />
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-panel-solid)] p-4">
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-1 block text-xs text-[var(--gp-muted)]">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-blue-600"
      />
    </label>
  );
}

function PaybookPreview({
  settings,
  stage,
  theme,
}: {
  settings: PaybookSettings;
  stage: PreviewStage;
  theme: "light" | "dark";
}) {
  return (
    <div
      className={styles.preview}
      data-preview-theme={theme}
      style={{ "--preview-accent": settings.accentColor } as React.CSSProperties}
    >
      <header className={styles.previewHeader}>
        <div className={styles.previewBrand}>
          {settings.logoImageUrl &&
          isSupportedLogoImageUrl(settings.logoImageUrl) ? (
            <span className={styles.previewLogo}>
              <img src={settings.logoImageUrl} alt="Merchant logo" />
            </span>
          ) : null}
          <span>
            <strong>{settings.brandName}</strong>
            {settings.subtitle ? <small>{settings.subtitle}</small> : null}
          </span>
        </div>
        <span className={styles.previewSecure}>
          <LockKeyhole size={14} />
          {settings.protectedPaymentLabel}
        </span>
      </header>

      <div className={styles.previewLayout}>
        <section className={styles.previewSummary}>
          <div className={styles.previewRequest}>
            <span>
              <ShieldCheck size={18} />
            </span>
            {settings.paymentRequestLabel}
          </div>
          <h3>{settings.brandName}</h3>
          <p>
            {settings.paymentToLabel}{" "}
            <strong>{settings.vendorLabel || settings.brandName}</strong>
          </p>
          <div className={styles.previewAmount}>₹4,000.00</div>
          {settings.showOrderDetails ? (
            <dl>
              <div>
                <dt>{settings.orderLabel}</dt>
                <dd>Invoice payment</dd>
              </div>
              <div>
                <dt>{settings.referenceLabel}</dt>
                <dd>gpl_8H4K2P</dd>
              </div>
            </dl>
          ) : null}
          {settings.showSupportText ? (
            <div className={styles.previewTrust}>
              <Check size={14} />
              {settings.supportText}
            </div>
          ) : null}
        </section>

        <section className={styles.previewCheckout}>
          {stage === "checkout" ? (
            <>
              <p className={styles.previewEyebrow}>
                {settings.upiPaymentLabel}
              </p>
              <h3>{settings.checkoutTitle}</h3>
              <p className={styles.previewHelper}>
                {settings.checkoutDescription}
              </p>
              <button type="button" className={styles.previewPrimary}>
                {settings.payButtonLabel}
              </button>
            </>
          ) : stage === "payment" ? (
            <>
              <p className={styles.previewEyebrow}>
                {settings.paySecurelyLabel}
              </p>
              <div className={styles.previewTitleRow}>
                <h3>{settings.mobileReadyTitle}</h3>
                <span>14:43</span>
              </div>
              <div className={styles.previewPrompt}>
                <span>
                  <small>{settings.singleUseLabel}</small>
                  <strong>₹4,000.00</strong>
                </span>
                <button type="button">
                  <QrCode size={16} />
                  {settings.showQrLabel}
                </button>
              </div>
              <p className={styles.previewAppLabel}>
                {settings.payWithAppLabel}
              </p>
              <div className={styles.previewApps}>
                {["PhonePe", "Paytm", "Google Pay", "Other UPI"].map((app) => (
                  <span key={app}>{app}</span>
                ))}
              </div>
              <div className={styles.previewActions}>
                <button type="button">{settings.checkStatusLabel}</button>
                <button type="button">{settings.copyPaymentLabel}</button>
              </div>
            </>
          ) : (
            <div className={styles.previewSuccess}>
              <span>
                <CheckCircle2 size={34} />
              </span>
              <p className={styles.previewEyebrow}>{settings.successLabel}</p>
              <h3>{settings.successTitle}</h3>
              <p>₹4,000.00 was paid successfully.</p>
              <button type="button" className={styles.previewPrimary}>
                {settings.doneButtonLabel}
              </button>
            </div>
          )}
        </section>
      </div>

      <footer className={styles.previewFooter}>
        <span>
          {settings.showPoweredBy
            ? "Powered by Wpay"
            : settings.brandName}
        </span>
        <span>{settings.footerNote}</span>
      </footer>
    </div>
  );
}
