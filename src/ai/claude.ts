import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { githubToolDefinitions, executeGitHubTool } from "../tools/github";
import { gmailToolDefinitions, executeGmailTool } from "../tools/gmail";
import { ConversationMessage } from "../types";

const allToolDefinitions = [...githubToolDefinitions, ...gmailToolDefinitions];

async function executeTool(
  toolName: string,
  input: Record<string, any>
) {
  // Gmail tools
  if (toolName === "pull_meetings") {
    return executeGmailTool(toolName, input);
  }
  // GitHub tools
  return executeGitHubTool(toolName, input);
}

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You are a PM assistant bot. You help the user — a product manager — with their work. You have access to their PM-OS GitHub repository (${config.githubOwner}/${config.githubRepo}) which contains company knowledge, documents, PRDs, meeting notes, and other project artifacts.

Your capabilities:
- Read files from the PM-OS repo to answer questions about the company, products, and projects
- Browse the repo structure to find relevant documents
- Search the repo for specific topics
- Generate PRDs, summaries, and analyses based on the repo content
- Create or update files in the PM-OS repo
- Pull meeting notes from Gmail (emails labeled "MeetingNotes") and save them to the repo

Guidelines:
- When the user asks about company information, ALWAYS check the repo first before answering.
- Start by listing the root directory to understand the repo structure if you haven't already.
- Be concise in your responses — the user is on mobile (Telegram/WhatsApp).
- When generating PRDs or documents, follow any templates found in the repo.
- If you can't find information in the repo, say so clearly rather than guessing.
- When asked to pull meetings, use pull_meetings to fetch from Gmail, then use create_file to save each meeting to raw/transcripts/{folder}/{filename} in the repo.`;

export async function chat(
  userMessage: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  let response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: allToolDefinitions,
    messages,
  });

  // Tool-call loop: keep going until Claude stops calling tools
  while (response.stop_reason === "tool_use") {
    const assistantContent = response.content;
    const toolUseBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      console.log(`[Tool Call] ${toolUse.name}:`, JSON.stringify(toolUse.input));
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, any>
      );
      console.log(
        `[Tool Result] ${toolUse.name}: ${result.content.substring(0, 200)}...`
      );

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.isError,
      });
    }

    // Add the assistant's response and tool results, then continue
    messages.push({ role: "assistant", content: assistantContent });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: allToolDefinitions,
      messages,
    });
  }

  // Extract the final text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );

  return textBlocks.map((b) => b.text).join("\n") || "I couldn't generate a response.";
}
