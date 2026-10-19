import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { dashboardAssetPath } from "../src/asset-path.ts";

test("plugin URL pathnames resolve within Unicode and spaced workspace paths", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dashboard-path-"));
  try {
    const directory = path.join(root, "文档", "project with spaces");
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "index.tsx");
    writeFileSync(file, "export default () => null");
    assert.equal(dashboardAssetPath(pathToFileURL(file).pathname), file);
    assert.equal(dashboardAssetPath(file), file);
    const literal = path.join(directory, "%20.tsx");
    writeFileSync(literal, "");
    assert.equal(dashboardAssetPath(literal), literal);
    assert.equal(dashboardAssetPath(pathToFileURL(literal).pathname), literal);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing and malformed paths remain unchanged", () => {
  assert.equal(dashboardAssetPath("/missing/%broken.tsx"), "/missing/%broken.tsx");
  assert.equal(dashboardAssetPath("/C:/missing/index.js"), "C:/missing/index.js");
});
