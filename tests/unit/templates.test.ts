import test from "node:test";
import assert from "node:assert/strict";

import { loadWorklogTemplate } from "../../src/core/templates.js";

test("current template includes Remaining Work", async () => {
  const template = await loadWorklogTemplate({ mode: "current" });
  assert.match(template.template, /## Remaining Work/);
});

test("historical template omits Remaining Work", async () => {
  const template = await loadWorklogTemplate({ mode: "historical" });
  assert.doesNotMatch(template.template, /## Remaining Work/);
  assert.match(template.template, /## Background/);
});
