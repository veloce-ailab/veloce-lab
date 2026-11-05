import assert from "node:assert/strict";
import { test } from "node:test";
import { lineDiff } from "../dist/actions.js";

test("an unchanged file reports nothing", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nb\nc"), { added: 0, removed: 0 });
});

test("a new file is all additions", () => {
  assert.deepEqual(lineDiff("", "a\nb\nc"), { added: 3, removed: 0 });
});

test("an emptied file is all deletions", () => {
  assert.deepEqual(lineDiff("a\nb", ""), { added: 0, removed: 2 });
});

test("appending counts only the new lines", () => {
  assert.deepEqual(lineDiff("a\nb", "a\nb\nc\nd"), { added: 2, removed: 0 });
});

test("a rewritten line is one addition and one deletion, not two of each", () => {
  // Comparing the two middles by length would call this 1/1 only by luck; the point is
  // that unchanged neighbours are trimmed rather than counted on both sides.
  assert.deepEqual(lineDiff("a\nb\nc\nd", "a\nB\nc\nd"), { added: 1, removed: 1 });
});

test("an insertion in the middle leaves the tail uncounted", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nb\nx\nc"), { added: 1, removed: 0 });
});

test("a repeated line is matched rather than counted twice", () => {
  assert.deepEqual(lineDiff("a\nb\na\nb", "a\nb"), { added: 0, removed: 2 });
});

test("a very large changed region still returns a usable count", () => {
  const before = Array.from({ length: 3000 }, (_, index) => `old ${index}`).join("\n");
  const after = Array.from({ length: 3000 }, (_, index) => `new ${index}`).join("\n");
  const result = lineDiff(before, after);
  assert.equal(result.added, 3000);
  assert.equal(result.removed, 3000);
});
