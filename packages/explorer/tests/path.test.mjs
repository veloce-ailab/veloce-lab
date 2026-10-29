import assert from "node:assert/strict"
import { test } from "node:test"
import { workspaceBreadcrumbs } from "../frontend/path.ts"

test("breadcrumbs start at the workspace and never offer its parent", () => {
  assert.deepEqual(workspaceBreadcrumbs("/home/dev/project", "/home/dev/project/src/ui"), [
    { label: "project", path: "/home/dev/project" },
    { label: "src", path: "/home/dev/project/src" },
    { label: "ui", path: "/home/dev/project/src/ui" },
  ])
})

test("outside paths collapse to the workspace breadcrumb", () => {
  assert.deepEqual(workspaceBreadcrumbs("/home/dev/project", "/home/dev"), [
    { label: "project", path: "/home/dev/project" },
  ])
})

test("Windows breadcrumbs retain Windows separators", () => {
  assert.deepEqual(workspaceBreadcrumbs("C:\\work\\project", "C:\\work\\project\\src"), [
    { label: "project", path: "C:\\work\\project" },
    { label: "src", path: "C:\\work\\project\\src" },
  ])
})

test("filesystem root is handled without introducing a double slash", () => {
  assert.deepEqual(workspaceBreadcrumbs("/", "/work/project"), [
    { label: "/", path: "/" },
    { label: "work", path: "/work" },
    { label: "project", path: "/work/project" },
  ])
})
