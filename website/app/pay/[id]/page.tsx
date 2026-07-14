"use client";

/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import styles from "./paybook.module.css";
import {
  serializePaybookSettings,
  type PaybookSettings,
} from "@/lib/paybook-settings";

const apiHeaders = {
  "ngrok-skip-browser-warning": "true",
};

type PaymentLink = {
  _id: string;
  linkId: string;
  merchantEmail: string;
  merchantName?: string;
  title: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: string;
  paidAt?: string | null;
  successRedirectUrl?: string;
  failedRedirectUrl?: string;
  paybook?: PaybookSettings;
};

type PaymentStage = "details" | "ready" | "success" | "failed";
type UpiApp = "gpay" | "phonepe" | "paytm" | "other";
type DevicePlatform = "android" | "ios" | "desktop";

const UPI_APPS: Array<{ id: UpiApp; name: string; icon?: string }> = [
  { id: "phonepe", name: "PhonePe", icon: "/payment-apps/phonepe.svg" },
  { id: "paytm", name: "Paytm", icon: "/payment-apps/paytm.svg" },
  { id: "gpay", name: "Google Pay", icon: "/payment-apps/google-pay.svg" },
  { id: "other", name: "Other UPI" },
];

function detectPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "desktop";
  if (/Android/i.test(navigator.userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
  return "desktop";
}

function buildUpiAppLink(
  app: UpiApp,
  upiLink: string,
  platform: DevicePlatform,
  fallbackUrl: string
) {
  const query = upiLink.replace(/^upi:\/\/pay\?/i, "");

  if (platform === "ios") {
    if (app === "gpay") return `gpay://upi/pay?${query}`;
    if (app === "phonepe") return `phonepe://pay?${query}`;
    if (app === "paytm") return `paytmmp://pay?${query}`;
    return upiLink;
  }

  if (app === "other") {
    return `intent://pay?${query}#Intent;scheme=upi;end`;
  }

  const packages: Record<Exclude<UpiApp, "other">, string> = {
    gpay: "com.google.android.apps.nbu.paisa.user",
    phonepe: "com.phonepe.app",
    paytm: "net.one97.paytm",
  };
  const fallback = fallbackUrl
    ? `;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`
    : "";
  return `intent://pay?${query}#Intent;scheme=upi;package=${packages[app]}${fallback};end`;
}

function formatAmount(currency: string, amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [paymentLink, setPaymentLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState<PaymentStage>("details");
  const [clientTxnId, setClientTxnId] = useState("");
  const [paymentTarget, setPaymentTarget] = useState("");
  const [upiLink, setUpiLink] = useState("");
  const [hostedPaymentUrl, setHostedPaymentUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>("desktop");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [failedLogoUrl, setFailedLogoUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(900);
  const [copied, setCopied] = useState(false);
  const [requiresUtr, setRequiresUtr] = useState(false);
  const [utr, setUtr] = useState("");
  const [utrSubmitting, setUtrSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("");
  const statusPollInFlight = useRef(false);
  const statusPollAttempts = useRef(0);

  const amountLabel = useMemo(
    () =>
      paymentLink
        ? formatAmount(paymentLink.currency, paymentLink.amount)
        : formatAmount("INR", 0),
    [paymentLink]
  );
  const paybook = useMemo(
    () => serializePaybookSettings(paymentLink?.paybook),
    [paymentLink?.paybook]
  );
  const brandName = paybook.brandName || paymentLink?.merchantName || "GlobalPay";
  const subtitle = paybook.subtitle;
  const vendorLabel = paybook.vendorLabel || paymentLink?.merchantName || paymentLink?.merchantEmail || brandName;
  const supportText = paybook.supportText;
  const showPoweredBy = paybook.showPoweredBy;
  const resolvedTheme =
    paybook.themeMode === "system" ? systemTheme : paybook.themeMode;
  const pageStyle = {
    "--pay-accent": paybook.accentColor,
  } as CSSProperties;

  function applyInitiatedPayment(data: {
    clientTxnId?: string;
    transaction?: { transactionId?: string };
    paymentTarget?: string;
    upiLink?: string;
    hostedPaymentUrl?: string;
    paymentUrl?: string;
    qrPayload?: string;
    expiresInSeconds?: number | string;
    requiresUtr?: boolean;
    utrLength?: number | string;
    verificationMode?: string;
  }) {
    const target = String(
      data.paymentTarget ||
        data.upiLink ||
        data.hostedPaymentUrl ||
        data.paymentUrl ||
        data.qrPayload ||
        ""
    ).trim();

    if (!target) return false;

    const directUpiLink = target.toLowerCase().startsWith("upi://") ? target : "";
    const duration = Math.max(0, Number(data.expiresInSeconds ?? 900));
    setClientTxnId(String(data.clientTxnId || data.transaction?.transactionId || ""));
    setPaymentTarget(target);
    setUpiLink(directUpiLink);
    setHostedPaymentUrl(String(data.hostedPaymentUrl || ""));
    setShowQr(false);
    setExpiresAt(Date.now() + duration * 1000);
    setSecondsRemaining(duration);
    setRequiresUtr(Boolean(data.requiresUtr));
    setVerificationStatus("");
    setStage("ready");
    statusPollAttempts.current = 0;
    setNotice(
      directUpiLink
        ? data.requiresUtr
          ? "Pay with UPI, then enter the 12-digit UTR to verify."
          : "Choose an app or scan the QR code to pay."
        : "Scan the QR code or continue to the secure payment page."
    );
    return true;
  }

  async function loadPaymentLink() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/payment-links/${id}`, {
        cache: "no-store",
        headers: apiHeaders,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Payment link not found");
        return;
      }

      setPaymentLink(data.paymentLink);
      if (data.paymentLink.status === "paid") {
        setStage("success");
        setExpiresAt(null);
      } else if (data.paymentInitiated) {
        applyInitiatedPayment({ ...(data.payment || {}), ...data });
      }
    } catch {
      setError("Unable to load payment details. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startPayment() {
    if (!paymentLink || paying) return;

    setPaying(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/payment-links/${paymentLink.linkId}/initiate`, {
        method: "POST",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Payment could not be started. Please try again.");
        return;
      }

      if (!applyInitiatedPayment(data)) {
        setError("The payment provider did not return a payment destination.");
        return;
      }
    } catch {
      setError("Something went wrong while starting the payment.");
    } finally {
      setPaying(false);
    }
  }

  async function checkStatus({ manual = false }: { manual?: boolean } = {}) {
    if (!paymentLink || statusPollInFlight.current) return;
    statusPollInFlight.current = true;
    statusPollAttempts.current += 1;
    if (manual) setChecking(true);

    try {
      const params = new URLSearchParams();
      if (clientTxnId) params.set("clientTxnId", clientTxnId);
      const query = params.toString();
      const response = await fetch(
        `/api/payment-links/${paymentLink.linkId || id}/status${
          query ? `?${query}` : ""
        }`,
        { cache: "no-store", headers: apiHeaders }
      );
      const data = await response.json();

      if (response.ok && data.paid) {
        setStage("success");
        setNotice("Payment received successfully.");
        setError("");
        setVerificationStatus("matched");
        setExpiresAt(null);
        setPaymentLink((current) =>
          current
            ? {
                ...current,
                status: "paid",
                paidAt: data.paymentLink?.paidAt || current.paidAt,
              }
            : current
        );
      } else if (
        response.ok &&
        ["failed", "failure", "cancelled", "canceled", "declined", "expired"].includes(
          String(data.status || data.paymentLink?.status || "").toLowerCase()
        )
      ) {
        setStage("failed");
        setExpiresAt(null);
        setNotice("");
        setError("The payment was not completed.");
        setVerificationStatus(String(data.status || data.paymentLink?.status || ""));
        setPaymentLink((current) =>
          current
            ? {
                ...current,
                status: String(data.paymentLink?.status || "failed"),
              }
            : current
        );
      } else if (statusPollAttempts.current > 150) {
        setNotice(
          "We could not confirm this payment yet. Please use Check status or contact the merchant with your reference."
        );
      } else if (response.ok) {
        const nextStatus = String(data.status || data.paymentLink?.status || "");
        setVerificationStatus(nextStatus);
        if (["verification_queued", "verification_running"].includes(nextStatus)) {
          setNotice("We are verifying your UTR with the receiving bank.");
        } else if (nextStatus === "manual_review") {
          setNotice("Your payment is under review. The merchant will receive confirmation after bank verification.");
        }
      }
    } catch {
      setNotice("We are still waiting for confirmation.");
    } finally {
      statusPollInFlight.current = false;
      if (manual) setChecking(false);
    }
  }

  async function copyPaymentTarget() {
    if (!paymentTarget) return;
    try {
      await navigator.clipboard.writeText(paymentTarget);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed. Please use the QR code or payment button.");
    }
  }

  function resetPayment() {
    setStage("details");
    statusPollAttempts.current = 0;
    setClientTxnId("");
    setPaymentTarget("");
    setUpiLink("");
    setHostedPaymentUrl("");
    setQrDataUrl("");
    setShowQr(false);
    setExpiresAt(null);
    setSecondsRemaining(900);
    setError("");
    setNotice("");
    setCopied(false);
    setRequiresUtr(false);
    setUtr("");
    setUtrSubmitting(false);
    setVerificationStatus("");
  }

  async function submitUtr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentLink || utrSubmitting) return;
    const normalizedUtr = utr.replace(/\D/g, "").slice(0, 12);
    if (normalizedUtr.length !== 12) {
      setError("Enter the 12-digit UTR from your payment app.");
      return;
    }

    setUtrSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/payment-links/${paymentLink.linkId}/utr`, {
        method: "POST",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ clientTxnId, utr: normalizedUtr }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.message || "Could not submit UTR for verification.");
        setVerificationStatus(String(data.status || ""));
        return;
      }
      setUtr(normalizedUtr);
      setVerificationStatus(String(data.status || "verification_queued"));
      setNotice("UTR submitted. We are verifying the bank credit.");
      await checkStatus({ manual: true });
    } catch {
      setError("Something went wrong while submitting the UTR.");
    } finally {
      setUtrSubmitting(false);
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPlatform(detectPlatform());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPaymentLink();
    }, 0);
    return () => window.clearTimeout(timer);
    // loadPaymentLink intentionally reads the current route id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!paymentTarget) return;

    let active = true;
    QRCode.toDataURL(paymentTarget, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#14201b", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setError("Unable to generate the QR code.");
      });

    return () => {
      active = false;
    };
  }, [paymentTarget]);

  useEffect(() => {
    if (stage !== "ready" || !expiresAt) return;

    const updateTimer = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, stage]);

  useEffect(() => {
    if (stage !== "ready" || !clientTxnId) return;
    const poller = window.setInterval(() => {
      void checkStatus();
    }, 2000);
    return () => window.clearInterval(poller);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientTxnId, stage]);

  useEffect(() => {
    if (stage !== "success" || !paymentLink?.successRedirectUrl) return;
    const redirect = window.setTimeout(() => {
      window.location.assign(paymentLink.successRedirectUrl as string);
    }, 2500);
    return () => window.clearTimeout(redirect);
  }, [paymentLink?.successRedirectUrl, stage]);

  useEffect(() => {
    if (stage !== "failed" || !paymentLink?.failedRedirectUrl) return;
    const redirect = window.setTimeout(() => {
      window.location.assign(paymentLink.failedRedirectUrl as string);
    }, 2500);
    return () => window.clearTimeout(redirect);
  }, [paymentLink?.failedRedirectUrl, stage]);

  const minutes = Math.floor(secondsRemaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (secondsRemaining % 60).toString().padStart(2, "0");

  return (
    <main
      className={styles.page}
      style={pageStyle}
      data-payment-checkout
      data-pay-theme={resolvedTheme}
    >
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={`${brandName} checkout`}>
          {paybook.logoImageUrl &&
          paybook.logoImageUrl !== failedLogoUrl ? (
            <span className={styles.brandLogo}>
              <img
                src={paybook.logoImageUrl}
                alt={`${brandName} logo`}
                onError={() => setFailedLogoUrl(paybook.logoImageUrl)}
              />
            </span>
          ) : null}
          <span>
            <strong>{brandName}</strong>
            {subtitle ? <small>{subtitle}</small> : null}
          </span>
        </Link>
        <div className={styles.secureLabel}>
          <LockKeyhole size={15} aria-hidden="true" />
          {paybook.protectedPaymentLabel}
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.summary} aria-labelledby="payment-title">
          <div className={styles.summaryIntro}>
            <span className={styles.iconPlate}>
              <ShieldCheck size={24} aria-hidden="true" />
            </span>
            <p>{paybook.paymentRequestLabel}</p>
          </div>

          {loading ? (
            <div className={styles.summarySkeleton} aria-label="Loading payment summary">
              <span />
              <span />
              <span />
            </div>
          ) : paymentLink ? (
            <>
              <h1 id="payment-title">{brandName}</h1>
              <p className={styles.vendorName}>
                {paybook.paymentToLabel}{" "}
                <strong>{vendorLabel}</strong>
              </p>
              <p className={styles.amount}>{amountLabel}</p>
              {paybook.showOrderDetails ? (
                <dl className={styles.details}>
                  <div>
                    <dt>{paybook.orderLabel}</dt>
                    <dd>{paymentLink.title || "Merchant payment"}</dd>
                  </div>
                  <div>
                    <dt>{paybook.referenceLabel}</dt>
                    <dd>{paymentLink.linkId}</dd>
                  </div>
                </dl>
              ) : null}
              {paybook.showSupportText && supportText ? (
                <div className={styles.trustNote}>
                  <Check size={16} aria-hidden="true" />
                  {supportText}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className={styles.checkout} aria-live="polite">
          {loading ? (
            <div className={styles.checkoutSkeleton}>
              <span />
              <span />
              <span />
            </div>
          ) : error && !paymentLink ? (
            <div className={styles.emptyState}>
              <AlertCircle size={30} aria-hidden="true" />
              <h2>Payment unavailable</h2>
              <p>{error}</p>
              <button type="button" onClick={loadPaymentLink} className={styles.secondaryButton}>
                <RefreshCw size={17} aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : stage === "success" ? (
            <div className={styles.successState}>
              <span className={styles.successIcon}>
                <CheckCircle2 size={42} aria-hidden="true" />
              </span>
              <p className={styles.stepLabel}>{paybook.successLabel}</p>
              <h2>{paybook.successTitle}</h2>
              <p>{amountLabel} was paid successfully.</p>
              <a
                href={paymentLink?.successRedirectUrl || "/"}
                className={styles.primaryButton}
              >
                {paybook.doneButtonLabel}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          ) : stage === "failed" ? (
            <div className={styles.failedState}>
              <span className={styles.failedIcon}>
                <AlertCircle size={42} aria-hidden="true" />
              </span>
              <p className={styles.stepLabel}>Payment failed</p>
              <h2>Payment not completed</h2>
              <p>
                We could not confirm this payment. You can return to the
                merchant or create a fresh payment request.
              </p>
              {paymentLink?.failedRedirectUrl ? (
                <a href={paymentLink.failedRedirectUrl} className={styles.primaryButton}>
                  Return to merchant
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              ) : (
                <button type="button" onClick={resetPayment} className={styles.primaryButton}>
                  Try again
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          ) : stage === "ready" ? (
            <div className={styles.readyState}>
              <div className={styles.readyHeading}>
                <div>
                  <p className={styles.stepLabel}>{paybook.paySecurelyLabel}</p>
                  <h2>
                    {platform === "desktop"
                      ? paybook.desktopReadyTitle
                      : paybook.mobileReadyTitle}
                  </h2>
                </div>
                <span className={styles.timer} aria-label={`${minutes} minutes ${seconds} seconds remaining`}>
                  {minutes}:{seconds}
                </span>
              </div>

              <div className={styles.paymentPrompt}>
                <div>
                  <p>{paybook.singleUseLabel}</p>
                  <strong>{amountLabel}</strong>
                </div>
                {showQr ? (
                  <span className={styles.qrShown} aria-live="polite">
                    <Check size={18} aria-hidden="true" />
                    {paybook.qrVisibleLabel}
                  </span>
                ) : (
                  <button type="button" onClick={() => setShowQr(true)}>
                    <QrCode size={18} aria-hidden="true" />
                    {paybook.showQrLabel}
                  </button>
                )}
              </div>

              {upiLink && platform !== "desktop" ? (
                <div className={styles.appSection}>
                  <p>{paybook.payWithAppLabel}</p>
                  <div className={styles.appGrid}>
                    {UPI_APPS.map((app) => (
                      <a
                        key={app.id}
                        href={buildUpiAppLink(
                          app.id,
                          upiLink,
                          platform,
                          hostedPaymentUrl
                        )}
                        className={styles.appButton}
                        aria-label={`Pay with ${app.name}`}
                      >
                        <span data-app={app.id}>
                          {app.icon ? (
                            <Image
                              src={app.icon}
                              alt=""
                              width={28}
                              height={28}
                              aria-hidden="true"
                            />
                          ) : (
                            <Smartphone size={22} aria-hidden="true" />
                          )}
                        </span>
                        <strong>{app.name}</strong>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {showQr ? (
                <div className={styles.qrArea}>
                  <div className={styles.qrFrame}>
                    {qrDataUrl ? (
                      <Image
                        src={qrDataUrl}
                        alt={upiLink ? "UPI payment QR code" : "Secure payment QR code"}
                        width={260}
                        height={260}
                        unoptimized
                        priority
                      />
                    ) : (
                      <div className={styles.qrLoading}>
                        <QrCode size={42} aria-hidden="true" />
                        <span>Preparing QR</span>
                      </div>
                    )}
                  </div>
                  <p>
                    {upiLink
                      ? "Scan with any UPI app"
                      : "Scan with your phone camera to open the secure payment page"}
                  </p>
                </div>
              ) : null}

              {!upiLink ? (
                <a
                  href={paymentTarget}
                  className={styles.primaryButton}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {paybook.continuePaymentLabel}
                  <ExternalLink size={18} aria-hidden="true" />
                </a>
              ) : hostedPaymentUrl ? (
                <a
                  href={hostedPaymentUrl}
                  className={styles.fallbackLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Trouble opening an app? Use secure payment page
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : null}

              <div className={styles.paymentActions}>
                <button type="button" onClick={() => checkStatus({ manual: true })} disabled={checking}>
                  <RefreshCw className={checking ? styles.spinning : ""} size={16} aria-hidden="true" />
                  {checking ? "Checking" : paybook.checkStatusLabel}
                </button>
                <button type="button" onClick={copyPaymentTarget}>
                  {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {copied ? "Copied" : paybook.copyPaymentLabel}
                </button>
              </div>

              {requiresUtr ? (
                <form className={styles.utrPanel} onSubmit={submitUtr}>
                  <label htmlFor="payment-utr">
                    <span>Enter 12-digit UTR</span>
                    <small>Submit the UTR after completing payment in your UPI app.</small>
                  </label>
                  <div className={styles.utrInputRow}>
                    <input
                      id="payment-utr"
                      value={utr}
                      onChange={(event) => {
                        setUtr(event.target.value.replace(/\D/g, "").slice(0, 12));
                        setError("");
                      }}
                      inputMode="numeric"
                      pattern="[0-9]{12}"
                      maxLength={12}
                      placeholder="123456789012"
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      disabled={utrSubmitting || utr.length !== 12}
                    >
                      {utrSubmitting ? (
                        <RefreshCw className={styles.spinning} size={15} aria-hidden="true" />
                      ) : (
                        <Check size={15} aria-hidden="true" />
                      )}
                      {utrSubmitting ? "Submitting" : "Verify"}
                    </button>
                  </div>
                  {verificationStatus ? (
                    <p className={styles.utrStatus}>
                      {verificationStatus === "verification_queued" ||
                      verificationStatus === "verification_running"
                        ? "Verification in progress"
                        : verificationStatus === "manual_review"
                          ? "Manual review"
                          : verificationStatus === "matched"
                            ? "Verified"
                            : verificationStatus.replace(/_/g, " ")}
                    </p>
                  ) : null}
                </form>
              ) : null}

              {secondsRemaining === 0 ? (
                <div className={styles.expiredActions}>
                  <button type="button" onClick={resetPayment} className={styles.secondaryButton}>
                    Generate a new payment
                  </button>
                  {paymentLink?.failedRedirectUrl ? (
                    <a href={paymentLink.failedRedirectUrl} className={styles.fallbackLink}>
                      Return to merchant
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className={styles.detailsStage}>
              <p className={styles.stepLabel}>{paybook.upiPaymentLabel}</p>
              <h2>{paybook.checkoutTitle}</h2>
              <p className={styles.helper}>
                {paybook.checkoutDescription}
              </p>

              <button
                type="button"
                onClick={startPayment}
                disabled={paying}
                className={styles.primaryButton}
              >
                {paying ? (
                  <>
                    <RefreshCw className={styles.spinning} size={18} aria-hidden="true" />
                    Preparing payment
                  </>
                ) : (
                  <>
                    {paybook.payButtonLabel}
                    <ArrowRight size={18} aria-hidden="true" />
                  </>
                )}
              </button>

              {paybook.showSupportText && supportText ? (
                <div className={styles.securityRow}>
                  <LockKeyhole size={16} aria-hidden="true" />
                  {supportText}
                </div>
              ) : null}
            </div>
          )}

          {error && paymentLink ? (
            <div className={styles.errorMessage} role="alert">
              <AlertCircle size={17} aria-hidden="true" />
              {error}
            </div>
          ) : null}
          {notice && !error && stage === "ready" ? (
            <div className={styles.noticeMessage}>{notice}</div>
          ) : null}
        </section>
      </div>

      <footer className={styles.footer}>
        {showPoweredBy ? <span>Powered by GlobalPay</span> : <span>{brandName}</span>}
        <span>{paybook.footerNote}</span>
      </footer>
    </main>
  );
}
