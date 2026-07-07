import dotenv from "dotenv";
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  githubToken: requireEnv("GITHUB_TOKEN"),
  githubOwner: requireEnv("GITHUB_OWNER"),
  githubRepo: requireEnv("GITHUB_REPO"),
  port: parseInt(process.env.PORT || "3000", 10),
};
