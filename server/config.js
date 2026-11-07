import dotenv from "dotenv";
dotenv.config();

const chatbotProvider = (process.env.CHATBOT_PROVIDER || "openai-compatible").toLowerCase();

export const config = {
  port: process.env.PORT || 5001,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dineflow",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
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
