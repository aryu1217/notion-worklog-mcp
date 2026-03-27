import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export type WorklogConfig = {
  packageRoot: string;
  workspaceRoot: string;
  notionApiKey: string | null;
  notionParentPageId: string | null;
  notionDataSourceId: string | null;
  databaseTitle: string;
  timeZone: string;
  templateDir: string;
};

function hasRepoMarker(dir: string) {
  return fs.existsSync(path.join(dir, ".git"));
}

function resolveConfigPath(root: string, relativePath: string) {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(root, relativePath);
}

function getDefaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getPackageRoot() {
  return PACKAGE_ROOT;
}

export function resolveWorkspaceRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  while (true) {
    if (hasRepoMarker(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

export function loadConfig(startDir = process.cwd()): WorklogConfig {
  const workspaceRoot = resolveWorkspaceRoot(startDir);

  dotenv.config({ path: path.join(workspaceRoot, ".env.local"), quiet: true });
  dotenv.config({ path: path.join(workspaceRoot, ".env"), quiet: true });

  const templateDirInput =
    process.env.WORKLOG_TEMPLATE_DIR?.trim() || path.join(PACKAGE_ROOT, "templates");

  return {
    packageRoot: PACKAGE_ROOT,
    workspaceRoot,
    notionApiKey: process.env.NOTION_API_KEY?.trim() || null,
    notionParentPageId: process.env.NOTION_PARENT_PAGE_ID?.trim() || null,
    notionDataSourceId: process.env.NOTION_DATA_SOURCE_ID?.trim() || null,
    databaseTitle:
      process.env.WORKLOG_DATABASE_TITLE?.trim() || "Work Documentation Calendar",
    timeZone: process.env.WORKLOG_TIME_ZONE?.trim() || getDefaultTimeZone(),
    templateDir: resolveConfigPath(workspaceRoot, templateDirInput),
  };
}
