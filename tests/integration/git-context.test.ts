import test from "node:test";
import assert from "node:assert/strict";

import {
  collectCurrentWorkContext,
  collectHistoricalWorkContext,
  inspectGitWorkspace,
} from "../../src/core/index.js";
import { createFixtureRepo } from "../test-helpers.js";

test("inspectGitWorkspace resolves the fixture repository", async () => {
  const fixture = await createFixtureRepo();

  try {
    const workspace = await inspectGitWorkspace(fixture.root);
    assert.equal(workspace.branchName, "main");
    assert.equal(workspace.repoRoot, fixture.root);
  } finally {
    await fixture.cleanup();
  }
});

test("collectCurrentWorkContext captures working tree changes", async () => {
  const fixture = await createFixtureRepo();

  try {
    const { workContext } = await collectCurrentWorkContext({
      startDir: fixture.root,
    });

    assert.equal(workContext.mode, "current");
    assert.equal(workContext.branchName, "main");
    assert.ok(workContext.changedFiles.includes("README.md"));
    assert.ok(workContext.changedFiles.includes("src/ui.ts"));
  } finally {
    await fixture.cleanup();
  }
});

test("collectHistoricalWorkContext supports date mode", async () => {
  const fixture = await createFixtureRepo();

  try {
    const { workContext } = await collectHistoricalWorkContext({
      date: "2026-02-11",
      startDir: fixture.root,
    });

    assert.equal(workContext.mode, "historical_date");
    assert.equal(workContext.referenceDate, "2026-02-11");
    assert.equal(workContext.totalCommits, 1);
    assert.match(workContext.details, /Collected 1 commits/);
  } finally {
    await fixture.cleanup();
  }
});

test("collectHistoricalWorkContext supports commit mode", async () => {
  const fixture = await createFixtureRepo();

  try {
    const { workContext } = await collectHistoricalWorkContext({
      commit: fixture.prefetchSha.slice(0, 7),
      startDir: fixture.root,
    });

    assert.equal(workContext.mode, "historical_commit");
    assert.equal(workContext.totalCommits, 1);
    assert.equal(workContext.referenceCommit, fixture.prefetchSha);
    assert.match(workContext.defaultHeading, /commit/);
  } finally {
    await fixture.cleanup();
  }
});
