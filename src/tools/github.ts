import { Octokit } from "@octokit/rest";
import { config } from "../config";
import { ToolResult } from "../types";

const octokit = new Octokit({ auth: config.githubToken });

const owner = config.githubOwner;
const repo = config.githubRepo;

export async function readFile(
  path: string,
  branch?: string
): Promise<ToolResult> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    const data = response.data;
    if (Array.isArray(data)) {
      return {
        content: `"${path}" is a directory, not a file. Use list_directory instead.`,
        isError: true,
      };
    }

    if (data.type !== "file" || !("content" in data)) {
      return { content: `"${path}" is not a readable file.`, isError: true };
    }

    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    return { content: decoded };
  } catch (err: any) {
    return {
      content: `Error reading "${path}": ${err.message}`,
      isError: true,
    };
  }
}

export async function listDirectory(
  path: string = "",
  branch?: string
): Promise<ToolResult> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: path || "",
      ref: branch,
    });

    const data = response.data;
    if (!Array.isArray(data)) {
      return {
        content: `"${path}" is a file, not a directory. Use read_file instead.`,
        isError: true,
      };
    }

    const listing = data.map((item) => ({
      name: item.name,
      type: item.type,
      path: item.path,
      size: item.size,
    }));

    return { content: JSON.stringify(listing, null, 2) };
  } catch (err: any) {
    return {
      content: `Error listing "${path}": ${err.message}`,
      isError: true,
    };
  }
}

export async function searchRepo(query: string): Promise<ToolResult> {
  try {
    const response = await octokit.search.code({
      q: `${query} repo:${owner}/${repo}`,
    });

    if (response.data.total_count === 0) {
      return { content: `No results found for "${query}".` };
    }

    const results = response.data.items.slice(0, 10).map((item) => ({
      path: item.path,
      name: item.name,
      url: item.html_url,
    }));

    return { content: JSON.stringify(results, null, 2) };
  } catch (err: any) {
    return {
      content: `Error searching for "${query}": ${err.message}`,
      isError: true,
    };
  }
}

export async function createFile(
  path: string,
  content: string,
  commitMessage?: string
): Promise<ToolResult> {
  try {
    // Check if file already exists (to get its SHA for updates)
    let sha: string | undefined;
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path });
      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        sha = existing.data.sha;
      }
    } catch {
      // File doesn't exist yet — that's fine, we'll create it
    }

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: commitMessage || `Add ${path}`,
      content: Buffer.from(content).toString("base64"),
      sha,
    });

    return {
      content: sha
        ? `Updated file: ${path}`
        : `Created file: ${path}`,
    };
  } catch (err: any) {
    return {
      content: `Error creating "${path}": ${err.message}`,
      isError: true,
    };
  }
}

// Anthropic tool definitions for registration with the API
export const githubToolDefinitions = [
  {
    name: "read_file" as const,
    description:
      "Read the contents of a file from the PM-OS GitHub repository. Use this to fetch documents, PRDs, meeting notes, or any markdown file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description:
            "The file path relative to the repo root, e.g. 'docs/prd/feature-x.md'",
        },
        branch: {
          type: "string" as const,
          description: "Optional branch name. Defaults to the repo default branch.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory" as const,
    description:
      "List files and folders in a directory of the PM-OS GitHub repository. Use this to explore the repo structure and find documents.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description:
            "The directory path relative to the repo root. Use empty string or omit for the root directory.",
        },
        branch: {
          type: "string" as const,
          description: "Optional branch name. Defaults to the repo default branch.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_file" as const,
    description:
      "Create or update a file in the PM-OS GitHub repository. Use this to save meeting notes, PRDs, or other documents to the repo.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description:
            "The file path relative to the repo root, e.g. 'raw/transcripts/2026 July/2026-07-07_weekly-standup.md'",
        },
        content: {
          type: "string" as const,
          description: "The full file content to write.",
        },
        commit_message: {
          type: "string" as const,
          description:
            "Optional commit message. Defaults to 'Add {path}'.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "search_repo" as const,
    description:
      "Search for content across the PM-OS GitHub repository. Use this to find relevant documents when you don't know the exact file path.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "The search query to find relevant files and content.",
        },
      },
      required: ["query"],
    },
  },
];

// Execute a tool call by name
export async function executeGitHubTool(
  toolName: string,
  input: Record<string, any>
): Promise<ToolResult> {
  switch (toolName) {
    case "read_file":
      return readFile(input.path, input.branch);
    case "list_directory":
      return listDirectory(input.path, input.branch);
    case "search_repo":
      return searchRepo(input.query);
    case "create_file":
      return createFile(input.path, input.content, input.commit_message);
    default:
      return { content: `Unknown tool: ${toolName}`, isError: true };
  }
}
