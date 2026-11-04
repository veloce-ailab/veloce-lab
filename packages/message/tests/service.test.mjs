import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageService } from "../dist/index.js";

function setup({ coreNotification = true, injectedNotification = false } = {}) {
  const persisted = [];
  const notifications = [];
  const db = {
    async select() { return []; },
    async selectOne() { return undefined; },
    async create(_table, value) { const row = { ...value, id: persisted.length + 1 }; persisted.push(row); return row; },
  };
  class NotificationService {
    async send(input) { notifications.push(input); }
  }
  const core = {
    services: coreNotification ? { notification: NotificationService } : {},
    getService(name, context) { const ServiceType = this.services[name]; return ServiceType ? new ServiceType(context) : undefined; },
  };
  const context = {
    component: { database: db, ...(injectedNotification ? { notification: new NotificationService() } : {}) },
    getCore() { return core; },
  };
  const service = new MessageService(context);
  service.registerType({ affect() {} }, { id: "test:message", plugin: "test", label: "Test" });
  return { notifications, persisted, service };
}

test("resolves notification service from Core when caller context does not inject it", async () => {
  const f = setup();
  const result = await f.service.send({ userId: 4, type: "test:message", dedupeKey: "one", title: "Update" });
  assert.equal(result?.title, "Update");
  assert.equal(f.persisted.length, 1);
  assert.equal(f.notifications.length, 1);
});

test("persists message when notification service is not registered", async () => {
  const f = setup({ coreNotification: false });
  const result = await f.service.send({ userId: 4, type: "test:message", dedupeKey: "one", title: "Update" });
  assert.equal(result?.title, "Update");
  assert.equal(f.persisted.length, 1);
  assert.equal(f.notifications.length, 0);
});
