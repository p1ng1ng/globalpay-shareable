import { Resend } from "resend";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

export async function sendEmail(input: SendEmailInput) {
  try {
    const resend = getResendClient();

    if (!resend) {
      console.log("Email skipped: RESEND_API_KEY is not configured");
      return {
        success: false,
        skipped: true,
        message: "RESEND_API_KEY is not configured",
      };
    }

    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "Wpay <onboarding@resend.dev>";

    const result = await resend.emails.send({
      from: fromEmail,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Failed to send email:", error);

    return {
      success: false,
      skipped: false,
      message: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}

export function formatMoney(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toLocaleString("en-IN")}`;
}
