import assert from "node:assert/strict";
import test from "node:test";
import { apply } from "../dist/index.js";

async function plugin(cfg) {
  let registered;
  await apply(
    {
      i18n() {},
      registerComponent(name, value) {
        registered = { name, value };
      },
    },
    cfg,
  );
  return registered;
}

test("the plugin registers one component and it is the sandbox", async () => {
  const registered = await plugin({ allowUnsandboxedCommands: false, writablePaths: "" });
  assert.equal(registered.name, "sandbox");
  for (const method of ["backends", "run", "writableRoots", "allowsUnsandboxed"])
    assert.equal(typeof registered.value[method], "function", method);
  assert.equal(registered.value.allowsUnsandboxed(), false);
});

test("extra writable paths come from the plugin's own settings", async () => {
  const registered = await plugin({
    allowUnsandboxedCommands: true,
    writablePaths: "\n  /var/tmp  \n\n/tmp\n",
  });
  const roots = registered.value.writableRoots();
  assert.ok(roots.includes("/var/tmp"), roots.join(", "));
  assert.ok(roots.includes("/tmp"), roots.join(", "));
  assert.equal(registered.value.allowsUnsandboxed(), true);
});
