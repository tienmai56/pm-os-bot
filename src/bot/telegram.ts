import { Router, Request, Response } from "express";
import { config } from "../config";
import { chat } from "../ai/claude";
import { ConversationMessage } from "../types";
import { saveChatId } from "../store";

const router = Router();

// In-memory conversation history per chat (simple for Step 1)
const conversations = new Map<number, ConversationMessage[]>();

const MAX_HISTORY = 20; // Keep last 20 messages per chat

// Telegram sends messages with this shape
interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name: string };
    text?: string;
  };
}

export async function sendTelegramMessage(
  chatId: number,
  text: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;

  // Telegram has a 4096 char limit — split long messages
  const chunks = splitMessage(text, 4000);

  for (const chunk of chunks) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      // Retry without Markdown if parsing fails
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
        }),
      });
    }
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      // Fall back to splitting at a space
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

async function sendTypingAction(chatId: number): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendChatAction`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {}); // Non-critical, ignore errors
}

router.post("/", async (req: Request, res: Response) => {
  // Respond immediately so Telegram doesn't retry
  res.sendStatus(200);

  const update: TelegramUpdate = req.body;

  if (!update.message?.text) return;

  const chatId = update.message.chat.id;
  const userText = update.message.text;

  // Persist chat ID for scheduled messages
  saveChatId(chatId);

  console.log(`[Telegram] Message from chat ${chatId}: ${userText}`);

  // Handle /start command
  if (userText === "/start") {
    await sendTelegramMessage(
      chatId,
      "Hey! I'm your PM-OS assistant. Ask me anything about your company docs, or ask me to generate a PRD. I can read your PM-OS GitHub repo to help."
    );
    return;
  }

  // Handle /clear command to reset conversation
  if (userText === "/clear") {
    conversations.delete(chatId);
    await sendTelegramMessage(chatId, "Conversation cleared.");
    return;
  }

  try {
    await sendTypingAction(chatId);

    // Get or create conversation history
    const history = conversations.get(chatId) || [];

    const response = await chat(userText, history);

    // Update conversation history
    history.push({ role: "user", content: userText });
    history.push({ role: "assistant", content: response });

    // Trim history if too long
    while (history.length > MAX_HISTORY * 2) {
      history.shift();
    }

    conversations.set(chatId, history);

    await sendTelegramMessage(chatId, response);
  } catch (err: any) {
    console.error(`[Telegram] Error processing message:`, err);
    await sendTelegramMessage(
      chatId,
      "Sorry, I encountered an error processing your request. Please try again."
    );
  }
});

export default router;
