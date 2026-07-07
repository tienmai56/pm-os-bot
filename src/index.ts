import express from "express";
import { config } from "./config";
import telegramRouter from "./bot/telegram";

const app = express();

app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "pm-os-bot" });
});

// Telegram webhook
app.use("/webhook/telegram", telegramRouter);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`pm-os-bot running on port ${config.port}`);
  console.log(`Telegram webhook endpoint: /webhook/telegram`);
  console.log(`GitHub repo: ${config.githubOwner}/${config.githubRepo}`);
});
