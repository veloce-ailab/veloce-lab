import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { chmodSync } from "node:fs";
import { Sandbox } from "../dist/service.js";
import { landlockLauncher } from "../dist/landlock.js";
import { findExecutable } from "../dist/backends.js";

async function workspace(prefix = "vl-sbx-") {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

/** A PATH holding only what the test wants the host to appear to have. */
async function pathWith(entries) {
  const directory = await mkdtemp(path.join(tmpdir(), "vl-path-"));
  for (const [name, target] of Object.entries(entries))
    await symlink(target, path.join(directory, name));
  return directory;
}

test("the strongest usable backend wins, and Landlock stands behind it", async () => {
  const sandbox = new Sandbox();
  const backends = await sandbox.backends();
  if (backends.length === 0) {
    // A host with neither bubblewrap nor a compiler: nothing to rank.
    assert.equal(sandbox.allowsUnsandboxed(), false);
    return;
  }
  if (backends.includes("bwrap")) assert.equal(backends[0], "bwrap");
  if (backends.includes("bwrap") && backends.includes("landlock"))
    assert.deepEqual(backends, ["bwrap", "landlock"]);
});

test("a command writes inside its workspace and the kernel refuses the rest", async (t) => {
  const sandbox = new Sandbox();
  const backends = await sandbox.backends();
  if (backends.length === 0) {
    t.skip("this host provides no kernel sandbox");
    return;
  }
  const root = await workspace();
  const escape = path.join(homedir(), `vl-sbx-escape-${process.pid}.txt`);
  const writableOutside = await writeFile(escape, "probe").then(() => true, () => false);
  try {
    const inside = await sandbox.run({ workspace: root, command: "printf hi > inside.txt" });
    assert.equal(inside.exit_code, 0, inside.output);
    assert.equal(await readFile(path.join(root, "inside.txt"), "utf8"), "hi");
    assert.ok(inside.backend, "the outcome names the backend that confined it");

    const outside = await sandbox.run({
      workspace: root,
      command: `printf nope > ${JSON.stringify(escape)}`,
    });
    assert.notEqual(outside.exit_code, 0);
    assert.match(outside.output, /Sandbox:/);
    await assert.rejects(readFile(escape, "utf8"), /ENOENT/);

    // Reads and execs outside the workspace stay available: the boundary is
    // about writes, which is what the bubblewrap and Seatbelt backends do too.
    const reading = await sandbox.run({ workspace: root, command: "head -c 4 /etc/hostname >/dev/null; echo read-ok" });
    assert.equal(reading.exit_code, 0, reading.output);
    assert.match(reading.output, /read-ok/);

    if (writableOutside) {
      // Attributing the refusal: with confinement switched off entirely the very
      // same write goes through, so what refused it above was the sandbox.
      const empty = await pathWith({});
      try {
        const unconfined = new Sandbox({
          platformName: "linux",
          env: { ...process.env, PATH: empty },
          allowUnsandboxed: true,
        });
        const plain = await unconfined.run({
          workspace: root,
          command: `printf ok > ${JSON.stringify(escape)}`,
        });
        assert.equal(plain.exit_code, 0, plain.output);
        assert.equal((await readFile(escape, "utf8")).trim(), "ok");
      } finally {
        await rm(empty, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(escape, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("Landlock alone still confines the command", async (t) => {
  const compiler = ["cc", "gcc", "clang"]
    .map((name) => findExecutable(name))
    .find(Boolean);
  if (!compiler) {
    t.skip("no C compiler for the Landlock launcher");
    return;
  }
  const built = await landlockLauncher({ platformName: "linux" });
  if (!built.info) {
    t.skip(`the Landlock launcher is not usable here: ${built.reason}`);
    return;
  }
  // Only the compiler is on PATH, so bubblewrap cannot be chosen even if the
  // host has it: this is the fallback path, exercised on its own.
  const limitedPath = await pathWith({ cc: compiler });
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "vl-ll-cache-"));
  const sandbox = new Sandbox({
    platformName: "linux",
    env: { ...process.env, PATH: limitedPath },
    cacheRoot,
  });
  try {
    assert.deepEqual(await sandbox.backends(), ["landlock"]);
    const root = await workspace("vl-ll-");
    try {
      const inside = await sandbox.run({ workspace: root, command: "printf hi > a.txt && cat a.txt" });
      assert.equal(inside.exit_code, 0, inside.output);
      assert.equal(inside.backend, "landlock");
      assert.match(inside.output, /hi/);
      // Somewhere the harness may write but the confined command may not: the
      // workspace's own directory tree and the scratch area are both roots.
      const sibling = path.join(process.cwd(), `vl-ll-sibling-${process.pid}.txt`);
      const escaped = await sandbox.run({ workspace: root, command: `printf nope > ${JSON.stringify(sibling)}` });
      assert.notEqual(escaped.exit_code, 0, escaped.output);
      await assert.rejects(readFile(sibling, "utf8"), /ENOENT/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  } finally {
    await rm(limitedPath, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("a broken bubblewrap is skipped instead of failing the command", async (t) => {
  const compiler = ["cc", "gcc", "clang"]
    .map((name) => findExecutable(name))
    .find(Boolean);
  if (!compiler) {
    t.skip("no C compiler for the Landlock launcher");
    return;
  }
  if (!(await landlockLauncher({ platformName: "linux" })).info) {
    t.skip("the Landlock launcher is not usable here");
    return;
  }
  // A bwrap that is present but cannot confine anything, which is what a
  // container without user namespaces looks like.
  const pretend = await pathWith({ cc: compiler });
  const fakeBwrap = path.join(pretend, "bwrap");
  await writeFile(fakeBwrap, "#!/bin/sh\necho 'bwrap: No permissions to create new namespace' >&2\nexit 1\n");
  chmodSync(fakeBwrap, 0o755);
  const sandbox = new Sandbox({
    platformName: "linux",
    env: { ...process.env, PATH: pretend },
  });
  const root = await workspace("vl-fallback-");
  try {
    const outcome = await sandbox.run({ workspace: root, command: "printf hi > a.txt" });
    assert.equal(outcome.backend, "landlock", outcome.output);
    assert.equal(outcome.exit_code, 0, outcome.output);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(pretend, { recursive: true, force: true });
  }
});

test("a host with no backend refuses unless the deployment allows it", async () => {
  // Nothing on PATH and no compiler: neither kernel mechanism can be provided.
  const empty = await pathWith({});
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "vl-none-cache-"));
  const refusing = new Sandbox({
    platformName: "linux",
    env: { ...process.env, PATH: empty },
    cacheRoot,
  });
  const root = await workspace("vl-none-");
  try {
    await assert.rejects(
      refusing.run({ workspace: root, command: "echo hi" }),
      /Permission denied: no kernel sandbox/,
    );
    const permitted = new Sandbox({
      platformName: "linux",
      env: { ...process.env, PATH: empty },
      cacheRoot,
      allowUnsandboxed: true,
    });
    const outcome = await permitted.run({ workspace: root, command: "echo hi" });
    assert.equal(outcome.exit_code, 0);
    assert.equal(outcome.backend, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(empty, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

test("a session without a workspace has no boundary to hold", async () => {
  const sandbox = new Sandbox();
  await assert.rejects(sandbox.run({ workspace: "", command: "echo hi" }), /workspace folder/);
  await assert.rejects(sandbox.run({ workspace: "/", command: "echo hi" }), /below the filesystem root/);
});
