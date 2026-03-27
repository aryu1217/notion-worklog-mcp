import test from "node:test";
import assert from "node:assert/strict";

import {
  assertDateLabel,
  resolveEntryDateLabel,
  sha256,
} from "../../src/core/utils.js";

test("assertDateLabel accepts YYYY-MM-DD", () => {
  assert.equal(assertDateLabel("2026-02-11"), "2026-02-11");
});

test("assertDateLabel rejects invalid dates", () => {
  assert.throws(() => assertDateLabel("2026/02/11"));
});

test("resolveEntryDateLabel keeps explicit date labels", () => {
  assert.equal(
    resolveEntryDateLabel("2026-02-11", "Asia/Seoul"),
    "2026-02-11",
  );
});

test("sha256 returns a deterministic hash", () => {
  assert.equal(
    sha256("worklog"),
    "092b4394b86a41b4cb02ecf5aa8ba39dccbc16c51b6db9b1f7927cb74d6b4dd6",
  );
});
