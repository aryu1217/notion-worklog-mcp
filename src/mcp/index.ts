#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  appendWorklogEntry,
  collectCurrentWorkContext,
  collectHistoricalWorkContext,
  sha256,
  loadWorklogTemplate,
  resolveEntryDateLabel,
  toErrorToolResult,
  toTextToolResult,
  validateNotionTarget,
} from "../core/index.js";

const server = new McpServer({
  name: "notion-worklog-mcp",
  version: "0.1.0",
});

const targetTypeSchema = z.enum(["parent_page", "data_source"]);
const bootstrapActionSchema = z.enum([
  "used_existing_data_source",
  "created_database",
  "created_daily_page",
  "appended_existing_daily_page",
]);
const commitSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  author: z.string(),
  date: z.string(),
  subject: z.string(),
});
const fileChangeSchema = z.object({
  status: z.string(),
  path: z.string(),
  nextPath: z.string().optional(),
});
const statusEntrySchema = z.object({
  code: z.string(),
  path: z.string(),
});

server.registerTool(
  "collect_current_work_context",
  {
    description:
      "Collect the current Git workspace context needed to draft a worklog entry for ongoing work.",
    inputSchema: {
      maxCommits: z.number().int().min(1).max(100).optional(),
      maxDiffChars: z.number().int().min(1000).max(50000).optional(),
    },
    outputSchema: {
      ok: z.boolean(),
      mode: z.literal("current"),
      repoRoot: z.string(),
      branchName: z.string(),
      headSha: z.string(),
      headShortSha: z.string(),
      baseRef: z.string().nullable(),
      mergeBase: z.string(),
      defaultHeading: z.string(),
      commits: z.array(commitSchema),
      statusEntries: z.array(statusEntrySchema),
      committedFiles: z.array(fileChangeSchema),
      stagedFiles: z.array(fileChangeSchema),
      unstagedFiles: z.array(fileChangeSchema),
      untrackedFiles: z.array(z.string()),
      changedFiles: z.array(z.string()),
      committedDiffStat: z.string(),
      stagedDiffStat: z.string(),
      unstagedDiffStat: z.string(),
      committedDiffExcerpt: z.string(),
      stagedDiffExcerpt: z.string(),
      unstagedDiffExcerpt: z.string(),
      error: z.string().optional(),
    },
  },
  async ({ maxCommits, maxDiffChars }) => {
    try {
      const { workContext, text } = await collectCurrentWorkContext({
        maxCommits,
        maxDiffChars,
      });

      return toTextToolResult(text, {
        ok: true,
        ...workContext,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to collect the current work context.";

      return toErrorToolResult(message, {
        ok: false,
        mode: "current" as const,
        repoRoot: "",
        branchName: "",
        headSha: "",
        headShortSha: "",
        baseRef: null,
        mergeBase: "",
        defaultHeading: "",
        commits: [],
        statusEntries: [],
        committedFiles: [],
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        changedFiles: [],
        committedDiffStat: "",
        stagedDiffStat: "",
        unstagedDiffStat: "",
        committedDiffExcerpt: "",
        stagedDiffExcerpt: "",
        unstagedDiffExcerpt: "",
        error: message,
      });
    }
  },
);

server.registerTool(
  "collect_historical_work_context",
  {
    description:
      "Collect Git context for a past date or a specific commit so you can document historical work.",
    inputSchema: {
      date: z.string().optional().describe("Historical date in YYYY-MM-DD."),
      commit: z.string().optional().describe("A full SHA or short SHA."),
      maxCommits: z.number().int().min(1).max(100).optional(),
      maxDiffChars: z.number().int().min(1000).max(50000).optional(),
    },
    outputSchema: {
      ok: z.boolean(),
      mode: z.enum(["historical_date", "historical_commit"]),
      repoRoot: z.string(),
      branchName: z.string(),
      referenceDate: z.string(),
      referenceCommit: z.string().nullable(),
      defaultHeading: z.string(),
      commits: z.array(commitSchema),
      totalCommits: z.number(),
      changedFiles: z.array(z.string()),
      historicalFiles: z.array(fileChangeSchema),
      diffStat: z.string(),
      diffExcerpt: z.string(),
      details: z.string(),
      error: z.string().optional(),
    },
  },
  async ({ date, commit, maxCommits, maxDiffChars }) => {
    try {
      const { workContext, text } = await collectHistoricalWorkContext({
        date,
        commit,
        maxCommits,
        maxDiffChars,
      });

      return toTextToolResult(text, {
        ok: true,
        ...workContext,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to collect the historical work context.";

      return toErrorToolResult(message, {
        ok: false,
        mode: commit ? ("historical_commit" as const) : ("historical_date" as const),
        repoRoot: "",
        branchName: "",
        referenceDate: "",
        referenceCommit: null,
        defaultHeading: "",
        commits: [],
        totalCommits: 0,
        changedFiles: [],
        historicalFiles: [],
        diffStat: "",
        diffExcerpt: "",
        details: "",
        error: message,
      });
    }
  },
);

server.registerTool(
  "load_worklog_template",
  {
    description:
      "Load the built-in current or historical worklog template used to draft the final Markdown.",
    inputSchema: {
      mode: z
        .enum(["current", "historical"])
        .describe("Template mode to load."),
    },
    outputSchema: {
      ok: z.boolean(),
      mode: z.enum(["current", "historical"]),
      templatePath: z.string(),
      template: z.string(),
      error: z.string().optional(),
    },
  },
  async ({ mode }) => {
    try {
      const { templatePath, template } = await loadWorklogTemplate({ mode });
      return toTextToolResult(template, {
        ok: true,
        mode,
        templatePath,
        template,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load the template.";

      return toErrorToolResult(message, {
        ok: false,
        mode,
        templatePath: "",
        template: "",
        error: message,
      });
    }
  },
);

server.registerTool(
  "validate_notion_target",
  {
    description:
      "Validate that the Notion integration, parent page, worklog database, and target page are usable.",
    inputSchema: {
      entryDate: z
        .string()
        .optional()
        .describe("Optional target date. Use YYYY-MM-DD or an ISO datetime."),
    },
    outputSchema: {
      ok: z.boolean(),
      configured: z.boolean(),
      pageId: z.string().nullable(),
      pageTitle: z.string().nullable(),
      pageUrl: z.string().nullable(),
      canReadContent: z.boolean(),
      updateCapabilityHint: z.string(),
      details: z.string(),
      targetType: targetTypeSchema,
      databaseId: z.string().nullable(),
      dataSourceId: z.string().nullable(),
      databaseTitle: z.string().nullable(),
      dailyPageId: z.string().nullable(),
      dailyPageTitle: z.string().nullable(),
      bootstrapAction: bootstrapActionSchema.nullable().optional(),
    },
  },
  async ({ entryDate }) => {
    const validation = await validateNotionTarget({
      entryDate,
    });
    const text = [
      `configured: ${validation.configured}`,
      `pageId: ${validation.pageId ?? "N/A"}`,
      `pageTitle: ${validation.pageTitle ?? "N/A"}`,
      `pageUrl: ${validation.pageUrl ?? "N/A"}`,
      `targetType: ${validation.targetType}`,
      `databaseId: ${validation.databaseId ?? "N/A"}`,
      `dataSourceId: ${validation.dataSourceId ?? "N/A"}`,
      `databaseTitle: ${validation.databaseTitle ?? "N/A"}`,
      `dailyPageId: ${validation.dailyPageId ?? "N/A"}`,
      `dailyPageTitle: ${validation.dailyPageTitle ?? "N/A"}`,
      `canReadContent: ${validation.canReadContent}`,
      `bootstrapAction: ${validation.bootstrapAction ?? "N/A"}`,
      `details: ${validation.details}`,
      `hint: ${validation.updateCapabilityHint}`,
    ].join("\n");

    if (!validation.ok) {
      return toErrorToolResult(text, validation);
    }

    return toTextToolResult(text, validation);
  },
);

server.registerTool(
  "append_worklog_entry",
  {
    description:
      "Append approved Markdown to the matching Notion daily worklog page. Creates the database or daily page if needed.",
    inputSchema: {
      heading: z
        .string()
        .min(1)
        .describe("For example: ## 2026-03-19 09:30 | main | abc1234"),
      markdown: z.string().min(1).describe("The Markdown body to append."),
      entryDate: z
        .string()
        .optional()
        .describe("Optional target date. Use YYYY-MM-DD or an ISO datetime."),
      previewHash: z
        .string()
        .optional()
        .describe("Optional sha256 of the final payload to guard review/apply."),
    },
    outputSchema: {
      ok: z.boolean(),
      pageId: z.string().nullable(),
      pageUrl: z.string().nullable(),
      heading: z.string(),
      appendedCharacters: z.number(),
      resultMarkdownLength: z.number(),
      details: z.string(),
      targetType: targetTypeSchema,
      databaseId: z.string().nullable(),
      dataSourceId: z.string().nullable(),
      databaseTitle: z.string().nullable(),
      dailyPageId: z.string().nullable(),
      dailyPageTitle: z.string().nullable(),
      bootstrapAction: bootstrapActionSchema.nullable(),
    },
  },
  async ({ heading, markdown, entryDate, previewHash }) => {
    try {
      const result = await appendWorklogEntry({
        heading,
        markdown,
        entryDate,
        previewHash,
      });

      const label = resolveEntryDateLabel(entryDate, Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      const payloadPreview = `${heading.trim()}\n\n${markdown.trim()}\n`;
      const text = [
        `ok: ${result.ok}`,
        `pageId: ${result.pageId ?? "N/A"}`,
        `pageUrl: ${result.pageUrl ?? "N/A"}`,
        `targetType: ${result.targetType}`,
        `databaseId: ${result.databaseId ?? "N/A"}`,
        `dataSourceId: ${result.dataSourceId ?? "N/A"}`,
        `databaseTitle: ${result.databaseTitle ?? "N/A"}`,
        `dailyPageId: ${result.dailyPageId ?? "N/A"}`,
        `dailyPageTitle: ${result.dailyPageTitle ?? "N/A"}`,
        `bootstrapAction: ${result.bootstrapAction ?? "N/A"}`,
        `entryDate: ${label}`,
        `heading: ${result.heading}`,
        `appendedCharacters: ${result.appendedCharacters}`,
        `resultMarkdownLength: ${result.resultMarkdownLength}`,
        `payloadHash: ${sha256(payloadPreview)}`,
        `details: ${result.details}`,
      ].join("\n");

      if (!result.ok) {
        return toErrorToolResult(text, result);
      }

      return toTextToolResult(text, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to append the worklog entry.";

      return toErrorToolResult(message, {
        ok: false,
        pageId: null,
        pageUrl: null,
        heading,
        appendedCharacters: 0,
        resultMarkdownLength: 0,
        details: message,
        targetType: "parent_page" as const,
        databaseId: null,
        dataSourceId: null,
        databaseTitle: null,
        dailyPageId: null,
        dailyPageTitle: null,
        bootstrapAction: null,
      });
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("notion-worklog-mcp server running on stdio");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "notion-worklog-mcp failed",
  );
  process.exit(1);
});
