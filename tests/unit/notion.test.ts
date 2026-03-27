import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  appendWorklogEntry,
  validateNotionTarget,
} from "../../src/core/notion.js";

test("validateNotionTarget fails safely when env is missing", async () => {
  const originalApiKey = process.env.NOTION_API_KEY;
  const originalParent = process.env.NOTION_PARENT_PAGE_ID;
  const isolatedDir = await mkdtemp(path.join(os.tmpdir(), "worklog-notion-test-"));

  delete process.env.NOTION_API_KEY;
  delete process.env.NOTION_PARENT_PAGE_ID;

  const result = await validateNotionTarget({ startDir: isolatedDir });
  assert.equal(result.ok, false);
  assert.match(result.details, /NOTION_API_KEY or NOTION_PARENT_PAGE_ID is missing/);

  if (typeof originalApiKey === "string") {
    process.env.NOTION_API_KEY = originalApiKey;
  } else {
    delete process.env.NOTION_API_KEY;
  }

  if (typeof originalParent === "string") {
    process.env.NOTION_PARENT_PAGE_ID = originalParent;
  } else {
    delete process.env.NOTION_PARENT_PAGE_ID;
  }

  await rm(isolatedDir, { recursive: true, force: true });
});

test("appendWorklogEntry fails safely when env is missing", async () => {
  const originalApiKey = process.env.NOTION_API_KEY;
  const originalParent = process.env.NOTION_PARENT_PAGE_ID;
  const isolatedDir = await mkdtemp(path.join(os.tmpdir(), "worklog-append-test-"));

  delete process.env.NOTION_API_KEY;
  delete process.env.NOTION_PARENT_PAGE_ID;

  const result = await appendWorklogEntry({
    heading: "## 2026-02-11 | commit | abc1234",
    markdown: "Test entry",
    startDir: isolatedDir,
  });
  assert.equal(result.ok, false);
  assert.match(result.details, /NOTION_API_KEY or NOTION_PARENT_PAGE_ID is missing/);

  if (typeof originalApiKey === "string") {
    process.env.NOTION_API_KEY = originalApiKey;
  } else {
    delete process.env.NOTION_API_KEY;
  }

  if (typeof originalParent === "string") {
    process.env.NOTION_PARENT_PAGE_ID = originalParent;
  } else {
    delete process.env.NOTION_PARENT_PAGE_ID;
  }

  await rm(isolatedDir, { recursive: true, force: true });
});
