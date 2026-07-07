# CLAUDE.md - Project Rules & Context

## Project Overview
A remote agent hosted on Railway that acts as a PM assistant, accessible via Telegram/WhatsApp. It uses Claude (Anthropic API) as the brain and connects to a PM-OS GitHub repository for company knowledge.

## Architecture
- **Brain**: Anthropic API (Claude) with tool calling
- **Interface**: Telegram Bot API / WhatsApp (via Twilio) webhooks
- **Tools**: GitHub API (read/write PM-OS repo via MCP or direct API)
- **Host**: Railway (web service for messages + background worker for overnight tasks)

## Use Cases
1. Chat via Telegram/WhatsApp to generate PRDs on the go
2. Ask questions about company knowledge stored in PM-OS repo
3. Dispatch coding tasks to run overnight while asleep

## Rules for the Coding Agent

### Session Protocol
- **Before every coding session**, read the latest entry in `logs/` to understand what was done previously and gain context.
- **After every coding session**, write a new log entry in `logs/` with a timestamp recording what changed.

### Safety
- **Never use `rm -rf`**. Use targeted, safe deletions only.
- Never commit secrets, API keys, or tokens. Use environment variables.
- Never force-push to main/master.

### Code Style
- Keep things simple. Don't over-engineer.
- Only make changes that are directly requested or clearly necessary.
- Don't add features, refactor code, or make "improvements" beyond what was asked.
- Prefer editing existing files over creating new ones.

### Logging
- All changes are recorded in `logs/` with format `YYYY-MM-DD_HH-MM.md`.
- Each log entry includes: date/time, what changed, files modified, and next steps.

### Tech Stack (Step 1)
- Runtime: Node.js (TypeScript)
- Framework: Express or Fastify for webhook handling
- Anthropic SDK for Claude API
- Octokit for GitHub API
- Deployed on Railway
