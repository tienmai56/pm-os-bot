# Step 1 Implementation Plan

## Goal
Build a bot that:
1. Listens for incoming messages from Telegram (primary) and WhatsApp (secondary)
2. Sends the user's prompt to the Anthropic API (Claude)
3. Uses Tool Calling so Claude can fetch markdown docs from the PM-OS GitHub repo to answer questions or write PRDs

---

## Phase 1: Project Scaffolding

- Initialize Node.js project with TypeScript
- Set up `tsconfig.json`, `package.json`, `.env.example`, `.gitignore`
- Install core dependencies:
  - `@anthropic-ai/sdk` - Claude API
  - `express` - HTTP server for webhooks
  - `octokit` / `@octokit/rest` - GitHub API
  - `node-telegram-bot-api` or `telegraf` - Telegram bot
  - `dotenv` - environment variables
- Define folder structure:
  ```
  src/
    index.ts          # Entry point, starts Express server
    config.ts         # Env vars and configuration
    bot/
      telegram.ts     # Telegram webhook handler
    ai/
      claude.ts       # Anthropic API client + tool definitions
    tools/
      github.ts       # GitHub tool implementations (read files, list dirs, search)
    types/
      index.ts        # Shared TypeScript types
  ```

## Phase 2: GitHub Tools (Claude Tool Calling)

Define tools that Claude can call to interact with PM-OS repo:

1. **`read_file`** - Read a specific file from the repo by path
   - Input: `{ owner, repo, path, branch? }`
   - Returns: file content (decoded from base64)

2. **`list_directory`** - List files/folders in a directory
   - Input: `{ owner, repo, path?, branch? }`
   - Returns: array of file/folder names with types

3. **`search_repo`** - Search for content across the repo
   - Input: `{ owner, repo, query }`
   - Returns: matching file paths and snippets

These are registered as Anthropic tool definitions and executed when Claude decides to call them.

## Phase 3: Claude Integration

- Set up Anthropic client with API key
- Build a `chat()` function that:
  1. Takes user message + conversation history
  2. Sends to Claude with the GitHub tools registered
  3. Handles the tool-call loop (Claude calls tool -> we execute -> send result back -> Claude responds)
  4. Returns the final text response
- System prompt instructs Claude about the PM-OS repo structure and its role as a PM assistant

## Phase 4: Telegram Bot

- Create a Telegram bot via @BotFather, get the token
- Set up webhook endpoint: `POST /webhook/telegram`
- Parse incoming messages, extract text and chat ID
- Pass message to the Claude `chat()` function
- Send Claude's response back to the Telegram chat
- Handle long messages (Telegram has a 4096 char limit per message)

## Phase 5: Railway Deployment

- Create `Dockerfile` or use Railway's Nixpacks
- Set environment variables on Railway:
  - `ANTHROPIC_API_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - `GITHUB_TOKEN` (PAT with repo read access)
  - `GITHUB_OWNER` / `GITHUB_REPO` (PM-OS repo coordinates)
  - `WEBHOOK_SECRET` (optional, for verifying webhook calls)
- Deploy, set Telegram webhook URL to Railway service URL
- Test end-to-end

---

## What's NOT in Step 1 (deferred)
- WhatsApp / Twilio integration (Step 2)
- Background worker for overnight coding tasks (Step 2+)
- Conversation memory / persistence (Step 2)
- Writing/pushing files back to GitHub (Step 2)
- MCP server setup (future optimization)

---

## Environment Variables Needed
| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API access |
| `TELEGRAM_BOT_TOKEN` | Telegram bot authentication |
| `GITHUB_TOKEN` | GitHub PAT for reading PM-OS repo |
| `GITHUB_OWNER` | GitHub org/user owning PM-OS repo |
| `GITHUB_REPO` | PM-OS repository name |
| `PORT` | Server port (Railway sets this automatically) |
