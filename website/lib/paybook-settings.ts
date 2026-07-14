export type PaybookThemeMode = "system" | "light" | "dark";

export type PaybookSettings = {
  brandName: string;
  subtitle: string;
  vendorLabel: string;
  accentColor: string;
  supportText: string;
  logoImageUrl: string;
  themeMode: PaybookThemeMode;
  showPoweredBy: boolean;
  showOrderDetails: boolean;
  showSupportText: boolean;
  protectedPaymentLabel: string;
  paymentRequestLabel: string;
  paymentToLabel: string;
  orderLabel: string;
  referenceLabel: string;
  upiPaymentLabel: string;
  checkoutTitle: string;
  checkoutDescription: string;
  mobileNumberLabel: string;
  mobileNumberHelp: string;
  payButtonLabel: string;
  paySecurelyLabel: string;
  desktopReadyTitle: string;
  mobileReadyTitle: string;
  singleUseLabel: string;
  showQrLabel: string;
  qrVisibleLabel: string;
  payWithAppLabel: string;
  continuePaymentLabel: string;
  checkStatusLabel: string;
  copyPaymentLabel: string;
  successLabel: string;
  successTitle: string;
  doneButtonLabel: string;
  footerNote: string;
};

export const defaultPaybookSettings: PaybookSettings = {
  brandName: "Wpay",
  subtitle: "Secure checkout",
  vendorLabel: "",
  accentColor: "#087f5b",
  supportText: "Encrypted checkout. Your UPI PIN stays inside your payment app.",
  logoImageUrl: "",
  themeMode: "system",
  showPoweredBy: true,
  showOrderDetails: true,
  showSupportText: true,
  protectedPaymentLabel: "Protected payment",
  paymentRequestLabel: "Payment request",
  paymentToLabel: "Payment to",
  orderLabel: "Order",
  referenceLabel: "Reference",
  upiPaymentLabel: "UPI payment",
  checkoutTitle: "Pay from any UPI app",
  checkoutDescription: "Start a secure UPI payment request and complete it from your preferred app.",
  mobileNumberLabel: "Mobile number",
  mobileNumberHelp: "We use this only to create the payment request.",
  payButtonLabel: "Pay now",
  paySecurelyLabel: "Pay securely",
  desktopReadyTitle: "Scan or continue",
  mobileReadyTitle: "Choose your UPI app",
  singleUseLabel: "Single-use payment",
  showQrLabel: "Show QR",
  qrVisibleLabel: "QR shown",
  payWithAppLabel: "Pay with an app on this phone",
  continuePaymentLabel: "Continue to payment",
  checkStatusLabel: "Check status",
  copyPaymentLabel: "Copy payment link",
  successLabel: "Payment complete",
  successTitle: "Payment received",
  doneButtonLabel: "Done",
  footerNote: "Payments are subject to bank confirmation",
};

const THEME_MODES: PaybookThemeMode[] = ["system", "light", "dark"];

const TEXT_LIMITS: Record<
  Exclude<
    keyof PaybookSettings,
    | "showPoweredBy"
    | "showOrderDetails"
    | "showSupportText"
    | "themeMode"
  >,
  number
> = {
  brandName: 60,
  subtitle: 90,
  vendorLabel: 90,
  accentColor: 7,
  supportText: 240,
  logoImageUrl: 1000,
  protectedPaymentLabel: 50,
  paymentRequestLabel: 50,
  paymentToLabel: 50,
  orderLabel: 40,
  referenceLabel: 40,
  upiPaymentLabel: 50,
  checkoutTitle: 90,
  checkoutDescription: 180,
  mobileNumberLabel: 60,
  mobileNumberHelp: 140,
  payButtonLabel: 40,
  paySecurelyLabel: 50,
  desktopReadyTitle: 70,
  mobileReadyTitle: 70,
  singleUseLabel: 60,
  showQrLabel: 30,
  qrVisibleLabel: 30,
  payWithAppLabel: 80,
  continuePaymentLabel: 60,
  checkStatusLabel: 40,
  copyPaymentLabel: 50,
  successLabel: 50,
  successTitle: 70,
  doneButtonLabel: 30,
  footerNote: 140,
};

function sourceObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const candidate = value as { toObject?: () => Record<string, unknown> };
  return candidate.toObject?.() || (value as Record<string, unknown>);
}

function textValue(
  source: Record<string, unknown>,
  key: keyof typeof TEXT_LIMITS
) {
  const fallback = defaultPaybookSettings[key];
  const raw = source[key];

  if (raw === undefined || raw === null) return fallback;
  return String(raw).trim().slice(0, TEXT_LIMITS[key]);
}

export function isSupportedLogoImageUrl(value: string) {
  if (!value.trim()) return true;

  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      /\.(png|jpe?g)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function serializePaybookSettings(value: unknown): PaybookSettings {
  const source = sourceObject(value);
  const themeMode = String(source.themeMode || "");

  return {
    brandName: textValue(source, "brandName") || defaultPaybookSettings.brandName,
    subtitle: textValue(source, "subtitle"),
    vendorLabel: textValue(source, "vendorLabel"),
    accentColor: /^#[0-9a-f]{6}$/i.test(String(source.accentColor || ""))
      ? String(source.accentColor)
      : defaultPaybookSettings.accentColor,
    supportText: textValue(source, "supportText"),
    logoImageUrl: isSupportedLogoImageUrl(String(source.logoImageUrl || ""))
      ? textValue(source, "logoImageUrl")
      : "",
    themeMode: THEME_MODES.includes(themeMode as PaybookThemeMode)
      ? (themeMode as PaybookThemeMode)
      : defaultPaybookSettings.themeMode,
    showPoweredBy: source.showPoweredBy !== false,
    showOrderDetails: source.showOrderDetails !== false,
    showSupportText: source.showSupportText !== false,
    protectedPaymentLabel:
      textValue(source, "protectedPaymentLabel") ||
      defaultPaybookSettings.protectedPaymentLabel,
    paymentRequestLabel:
      textValue(source, "paymentRequestLabel") ||
      defaultPaybookSettings.paymentRequestLabel,
    paymentToLabel:
      textValue(source, "paymentToLabel") || defaultPaybookSettings.paymentToLabel,
    orderLabel: textValue(source, "orderLabel") || defaultPaybookSettings.orderLabel,
    referenceLabel:
      textValue(source, "referenceLabel") ||
      defaultPaybookSettings.referenceLabel,
    upiPaymentLabel:
      textValue(source, "upiPaymentLabel") ||
      defaultPaybookSettings.upiPaymentLabel,
    checkoutTitle:
      textValue(source, "checkoutTitle") || defaultPaybookSettings.checkoutTitle,
    checkoutDescription:
      textValue(source, "checkoutDescription") ||
      defaultPaybookSettings.checkoutDescription,
    mobileNumberLabel:
      textValue(source, "mobileNumberLabel") ||
      defaultPaybookSettings.mobileNumberLabel,
    mobileNumberHelp:
      textValue(source, "mobileNumberHelp") ||
      defaultPaybookSettings.mobileNumberHelp,
    payButtonLabel:
      textValue(source, "payButtonLabel") ||
      defaultPaybookSettings.payButtonLabel,
    paySecurelyLabel:
      textValue(source, "paySecurelyLabel") ||
      defaultPaybookSettings.paySecurelyLabel,
    desktopReadyTitle:
      textValue(source, "desktopReadyTitle") ||
      defaultPaybookSettings.desktopReadyTitle,
    mobileReadyTitle:
      textValue(source, "mobileReadyTitle") ||
      defaultPaybookSettings.mobileReadyTitle,
    singleUseLabel:
      textValue(source, "singleUseLabel") ||
      defaultPaybookSettings.singleUseLabel,
    showQrLabel:
      textValue(source, "showQrLabel") || defaultPaybookSettings.showQrLabel,
    qrVisibleLabel:
      textValue(source, "qrVisibleLabel") ||
      defaultPaybookSettings.qrVisibleLabel,
    payWithAppLabel:
      textValue(source, "payWithAppLabel") ||
      defaultPaybookSettings.payWithAppLabel,
    continuePaymentLabel:
      textValue(source, "continuePaymentLabel") ||
      defaultPaybookSettings.continuePaymentLabel,
    checkStatusLabel:
      textValue(source, "checkStatusLabel") ||
      defaultPaybookSettings.checkStatusLabel,
    copyPaymentLabel:
      textValue(source, "copyPaymentLabel") ||
      defaultPaybookSettings.copyPaymentLabel,
    successLabel:
      textValue(source, "successLabel") || defaultPaybookSettings.successLabel,
    successTitle:
      textValue(source, "successTitle") || defaultPaybookSettings.successTitle,
    doneButtonLabel:
      textValue(source, "doneButtonLabel") ||
      defaultPaybookSettings.doneButtonLabel,
    footerNote: textValue(source, "footerNote") || defaultPaybookSettings.footerNote,
  };
}
