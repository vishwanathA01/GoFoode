import dotenv from "dotenv";
dotenv.config();

const chatbotProvider = (process.env.CHATBOT_PROVIDER || "openai-compatible").toLowerCase();
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

export function isAllowedClientOrigin(origin) {
  if (!origin || origin === clientUrl) return true;
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    // In development, also allow devices on the local network (e.g. testing on a phone via the Network URL).
    const privateNetwork = /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/.test(url.hostname);
    return url.protocol === "http:" && (["localhost", "127.0.0.1"].includes(url.hostname) || privateNetwork);
  } catch {
    return false;
  }
}

const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || "").trim();
const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const isProduction = process.env.NODE_ENV === "production";

// PAYMENT_GATEWAY: auto (default) | razorpay | mock | none.
// "auto" uses Razorpay when keys are set, otherwise the built-in test gateway outside production.
function resolvePaymentGateway() {
  const requested = (process.env.PAYMENT_GATEWAY || "auto").trim().toLowerCase();
  const hasRazorpay = Boolean(razorpayKeyId && razorpayKeySecret);
  if (requested === "razorpay") return hasRazorpay ? "razorpay" : null;
  if (requested === "mock") return isProduction ? null : "mock";
  if (["none", "off", "disabled"].includes(requested)) return null;
  if (hasRazorpay) return "razorpay";
  return isProduction ? null : "mock";
}
const boundedNumber = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export const config = {
  port: process.env.PORT || 5001,
  payments: {
    gateway: resolvePaymentGateway(),
    razorpayKeyId,
    razorpayKeySecret,
    razorpayWebhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
    currency: "INR",
    // How long an online checkout stays open before its orders are cancelled and the cart restored.
    windowMinutes: boundedNumber(process.env.PAYMENT_WINDOW_MINUTES, 15, 1, 60),
    maxFailedAttempts: boundedNumber(process.env.PAYMENT_MAX_FAILED_ATTEMPTS, 5, 1, 20),
    maintenanceIntervalMs: boundedNumber(process.env.PAYMENT_SWEEP_INTERVAL_MS, 60000, 2000, 600000)
  },
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dineflow",
  clientUrl,
  accessSecret: process.env.JWT_ACCESS_SECRET || "development_access_secret_change_me_123456",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "development_refresh_secret_change_me_123456",
  accessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  chatbotProvider,
  chatbotApiUrl: process.env.CHATBOT_API_URL || (
    chatbotProvider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/models"
      : "https://api.openai.com/v1/chat/completions"
  ),
  chatbotApiKey: process.env.CHATBOT_API_KEY || "",
  chatbotModel: process.env.CHATBOT_MODEL || (chatbotProvider === "gemini" ? "gemini-flash-lite-latest" : "gpt-4o-mini")
};
