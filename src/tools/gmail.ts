import { google } from "googleapis";
import { config } from "../config";
import { ToolResult } from "../types";

const oauth2Client = new google.auth.OAuth2(
  config.gmailClientId,
  config.gmailClientSecret
);

oauth2Client.setCredentials({
  refresh_token: config.gmailRefreshToken,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

function decodeBase64Url(data: string): string {
  const padded = data + "=".repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

function extractBody(payload: any): string {
  const plain: string[] = [];
  const html: string[] = [];

  function walk(part: any) {
    const mime = part.mimeType || "";
    const data = part.body?.data;
    if (mime === "text/plain" && data) {
      plain.push(decodeBase64Url(data));
    } else if (mime === "text/html" && data) {
      html.push(decodeBase64Url(data));
    }
    for (const sub of part.parts || []) {
      walk(sub);
    }
  }

  walk(payload);

  if (plain.length) return plain.join("\n");
  if (html.length) {
    let text = html.join("\n");
    text = text.replace(/<style.*?<\/style>|<script.*?<\/script>/gis, "");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/p>/gi, "\n\n");
    text = text.replace(/<.*?>/gs, "");
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    return text;
  }
  return "";
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find(
    (h: any) => h.name.toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

function slugify(text: string): string {
  return text
    .replace(/[\u201c\u201d"']/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "-")
    .slice(0, 80);
}

export async function pullMeetings(
  since?: string,
  label: string = "MeetingNotes",
  maxResults: number = 20
): Promise<ToolResult> {
  try {
    let query = `label:${label}`;

    if (since) {
      const match = since.match(/^(\d+)([dw])$/);
      if (!match) {
        return {
          content: `Invalid "since" format. Use e.g. "7d" or "2w".`,
          isError: true,
        };
      }
      const days =
        parseInt(match[1]) * (match[2] === "w" ? 7 : 1);
      const cutoff = new Date(Date.now() - days * 86400000);
      const formatted = `${cutoff.getFullYear()}/${String(cutoff.getMonth() + 1).padStart(2, "0")}/${String(cutoff.getDate()).padStart(2, "0")}`;
      query += ` after:${formatted}`;
    }

    console.log(`[Gmail] Query: ${query}`);

    // Fetch message IDs
    const listResp = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    });

    const messages = listResp.data.messages || [];
    if (messages.length === 0) {
      return { content: `No meeting notes found with label "${label}".` };
    }

    console.log(`[Gmail] Found ${messages.length} message(s)`);

    // Fetch full content for each message
    const meetings: Array<{
      gmail_id: string;
      subject: string;
      from: string;
      date: string;
      date_iso: string;
      filename: string;
      folder: string;
      body: string;
    }> = [];

    for (const m of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "full",
      });

      const headers = msg.data.payload?.headers || [];
      const subject = getHeader(headers, "Subject") || "(no subject)";
      const sender = getHeader(headers, "From");
      const rawDate = getHeader(headers, "Date");

      let dateStr: string;
      let isoDate: string;
      let folder: string;
      try {
        const dt = new Date(rawDate);
        dateStr = dt.toISOString().split("T")[0];
        isoDate = dt.toISOString();
        const monthNames = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December",
        ];
        folder = `${dt.getFullYear()} ${monthNames[dt.getMonth()]}`;
      } catch {
        const now = new Date();
        dateStr = now.toISOString().split("T")[0];
        isoDate = rawDate;
        folder = `${now.getFullYear()} ${now.toLocaleString("en", { month: "long" })}`;
      }

      const cleanSubject = subject.replace(/^Notes:\s*/, "").trim();
      const slug = slugify(cleanSubject) || "meeting";
      const filename = `${dateStr}_${slug}.md`;

      const body = extractBody(msg.data.payload);

      const markdown =
        `---\n` +
        `source: gmail\n` +
        `gmail_id: ${m.id}\n` +
        `label: ${label}\n` +
        `subject: ${JSON.stringify(subject)}\n` +
        `from: ${JSON.stringify(sender)}\n` +
        `date: ${isoDate}\n` +
        `---\n\n` +
        `# ${cleanSubject}\n\n` +
        `${body}\n`;

      meetings.push({
        gmail_id: m.id!,
        subject: cleanSubject,
        from: sender,
        date: dateStr,
        date_iso: isoDate,
        filename,
        folder,
        body: markdown,
      });
    }

    return {
      content: JSON.stringify(
        {
          count: meetings.length,
          meetings: meetings.map((m) => ({
            gmail_id: m.gmail_id,
            subject: m.subject,
            from: m.from,
            date: m.date,
            filename: m.filename,
            folder: m.folder,
            body: m.body,
          })),
        },
        null,
        2
      ),
    };
  } catch (err: any) {
    return {
      content: `Error pulling meetings from Gmail: ${err.message}`,
      isError: true,
    };
  }
}

export const gmailToolDefinitions = [
  {
    name: "pull_meetings" as const,
    description:
      "Pull meeting notes/transcriptions from Gmail. Fetches emails with the MeetingNotes label and returns their content as structured markdown. After pulling, use create_file to save each meeting to the GitHub repo under raw/transcripts/{folder}/{filename}.",
    input_schema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string" as const,
          description:
            'Only pull emails newer than this. Format: "7d" for 7 days, "2w" for 2 weeks. Omit to pull all.',
        },
        label: {
          type: "string" as const,
          description:
            'Gmail label to search. Defaults to "MeetingNotes".',
        },
        max_results: {
          type: "number" as const,
          description: "Maximum number of emails to fetch. Defaults to 20.",
        },
      },
      required: [],
    },
  },
];

export async function executeGmailTool(
  toolName: string,
  input: Record<string, any>
): Promise<ToolResult> {
  switch (toolName) {
    case "pull_meetings":
      return pullMeetings(input.since, input.label, input.max_results);
    default:
      return { content: `Unknown Gmail tool: ${toolName}`, isError: true };
  }
}
