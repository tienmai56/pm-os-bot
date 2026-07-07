import cron from "node-cron";
import { sendTelegramMessage } from "./bot/telegram";
import { getChatId } from "./store";

export function startScheduler(): void {
  // 8:00 AM Pacific — morning todo check-in
  cron.schedule(
    "0 8 * * *",
    async () => {
      const chatId = getChatId();
      if (!chatId) {
        console.log("[Scheduler] No chat ID saved yet, skipping morning message");
        return;
      }
      console.log("[Scheduler] Sending morning todo check-in");
      await sendTelegramMessage(
        chatId,
        "Good morning! What are your todo items for today?"
      );
    },
    { timezone: "America/Los_Angeles" }
  );

  // 5:00 PM Pacific — EOD check-in
  cron.schedule(
    "0 17 * * *",
    async () => {
      const chatId = getChatId();
      if (!chatId) {
        console.log("[Scheduler] No chat ID saved yet, skipping EOD message");
        return;
      }
      console.log("[Scheduler] Sending EOD check-in");
      await sendTelegramMessage(
        chatId,
        "It's 5 PM — time for a quick check-in!\n\n" +
          "1. What items did you complete today?\n" +
          "2. What's still in progress?\n" +
          "3. What's left for tomorrow?"
      );
    },
    { timezone: "America/Los_Angeles" }
  );

  console.log("[Scheduler] Daily check-ins scheduled (8 AM & 5 PM Pacific)");
}
