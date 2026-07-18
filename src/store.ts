import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CHAT_ID_FILE = path.join(DATA_DIR, "chat-id.txt");

let cachedChatId: number | null = null;

export function saveChatId(chatId: number): void {
  if (cachedChatId === chatId) return;
  cachedChatId = chatId;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CHAT_ID_FILE, String(chatId));
    console.log(`[Store] Saved chat ID: ${chatId}`);
  } catch (err) {
    console.error("[Store] Failed to save chat ID:", err);
  }
}

