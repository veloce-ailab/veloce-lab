import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  bwrapArgv,
  confinedArgv,
  findExecutable,
  landlockArgv,
  seatbeltArgv,
  seatbeltProfile,
  shellFor,
  staticLaunchers,
} from "../dist/backends.js";

const layout = {
  workspace: "/work/app",
  cwd: "/work/app",
  writableRoots: ["/work/app", "/tmp", "/home/dev/.cache", "/dev"],
  tempDirectory: "/tmp",
};
const shell = { file: "/bin/sh", args: ["-c", "printf hi > a.txt"] };

test("the shell is the same one the unconfined path uses", () => {
  assert.deepEqual(shellFor("echo hi", "linux", { SHELL: "/usr/bin/zsh" }), {
    file: "/usr/bin/zsh",
    args: ["-c", "echo hi"],
  });
  assert.equal(shellFor("dir", "win32", { ComSpec: "C:\\Windows\\cmd.exe" }).file, "C:\\Windows\\cmd.exe");
});

test("bubblewrap makes the world read-only before binding the writable roots", () => {
  const argv = bwrapArgv(layout, shell);
  const readOnly = argv.indexOf("--ro-bind");
  assert.equal(argv[readOnly + 1], "/");
  // Every writable root must be bound after the read-only view, because the
  // later mount wins. `/tmp` is also the scratch directory here, so the pairs
  // are read off the `--bind` markers rather than by searching for the path.
  const binds = argv
    .map((value, index) => (value === "--bind" ? { index, from: argv[index + 1], to: argv[index + 2] } : undefined))
    .filter(Boolean);
  for (const root of layout.writableRoots.filter((entry) => entry !== layout.tempDirectory)) {
    const pair = binds.find((bind) => bind.from === root && bind.to === root);
    assert.ok(pair, `${root} must be bound writable`);
    assert.ok(pair.index > readOnly, `${root} must be bound after --ro-bind /`);
  }
  assert.equal(argv[argv.indexOf("--chdir") + 1], "/work/app");
  assert.deepEqual(argv.slice(-4), ["--", "/bin/sh", "-c", "printf hi > a.txt"]);
});

test("Landlock gets the roots and then the command", () => {
  assert.deepEqual(landlockArgv(layout, shell), [
    "/work/app",
    "/tmp",
    "/home/dev/.cache",
    "/dev",
    "--",
    "/bin/sh",
    "-c",
    "printf hi > a.txt",
  ]);
});

test("the Seatbelt profile denies writes and allows the same roots", () => {
  const profile = seatbeltProfile(["/work/app", "/tmp"]);
  assert.match(profile, /\(deny file-write\*\)/);
  assert.ok(profile.includes('(subpath "/work/app")'), profile);
  assert.ok(profile.includes('(subpath "/tmp")'), profile);
  const argv = seatbeltArgv(layout, shell);
  assert.equal(argv[0], "-p");
  assert.match(argv[1], /file-write\*/);
  assert.equal(argv[2], "/bin/sh");
});

test("each backend's argv starts with its own way in", () => {
  const bwrap = { backend: "bwrap", launcher: "/usr/bin/bwrap" };
  const landlock = { backend: "landlock", launcher: "/cache/landlock-exec" };
  const seatbelt = { backend: "sandbox-exec", launcher: "/usr/bin/sandbox-exec" };
  assert.equal(confinedArgv(bwrap, layout, shell)[0], "--ro-bind");
  assert.equal(confinedArgv(landlock, layout, shell)[0], "/work/app");
  assert.equal(confinedArgv(seatbelt, layout, shell)[0], "-p");
});

test("a launcher is only found where a shell would find it", () => {
  assert.equal(findExecutable("definitely-not-a-program-here", { PATH: "/usr/bin:/bin" }), undefined);
  assert.equal(findExecutable("/nonexistent/bwrap", {}), undefined);
  assert.equal(findExecutable("sh", { PATH: "/usr/bin:/bin" }), path.join("/usr/bin", "sh"));
  assert.equal(findExecutable("sh", { PATH: "/nonexistent::/bin" }), "/bin/sh");
});

test("only the platforms with a kernel mechanism offer a backend", () => {
  assert.deepEqual(staticLaunchers("win32", { PATH: "/usr/bin" }), []);
  assert.deepEqual(staticLaunchers("freebsd", { PATH: "/usr/bin" }), []);
  assert.deepEqual(staticLaunchers("linux", { PATH: "/nonexistent" }), []);
  assert.deepEqual(staticLaunchers("darwin", { PATH: "/nonexistent" }), []);
});
