export async function sendTelegramAlert(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return {
      success: false,
      message: "Missing Telegram environment variables",
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    console.error("Telegram alert failed:", data);
    return {
      success: false,
      telegram: data,
    };
  }

  return {
    success: true,
    telegram: data,
  };
}
