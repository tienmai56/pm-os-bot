export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}
