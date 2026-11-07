// An image studio: a form, a queue of generation tasks, and the file library.
//
// Generation is slow enough that answering a request with the picture would be
// wrong — a provider can take a minute — so a submission creates a task and the
// page watches the list. When a task finishes its images are written into the
// user's file library through `@velocelab/advanced-chat`, which means a
// generated picture is an ordinary library file: attachments and the knowledge
// base can use it without knowing it was generated.
//
// The provider is whatever channel serves the chosen model. The studio knows
// nothing about provider payloads; it hands provider-neutral parameters to the
// channel's adapter (`operation: "image_generate"`) and reads the result back
// through the adapter's image parser.
import { randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/adapters";
import "@velocelab/advanced-chat";
import "@velocelab/dashboard";
import "@velocelab/file";
import type { AdapterInput, AdapterRegistry, GeneratedImage } from "@velocelab/adapters";
import type { AdvancedChatService, Channel, Model, ModelConfig } from "@velocelab/advanced-chat";
import { upstreamURL } from "@velocelab/advanced-chat";

export const depend = ["database", "dashboard", "file", "adapters", "advanced-chat"];
export const provide = ["image"];

export interface ImageConfig {
  /** Tasks one user may have in flight at once; the rest wait in the queue. */
  maxConcurrentPerUser: string;
  /** One upstream call, including a provider's own polling. */
  requestTimeoutMs: string;
  /** How often an asynchronous provider (one that returns a task id) is asked. */
  pollIntervalMs: string;
  /** Most images a single task may ask for. */
  maxImagesPerTask: string;
}

export const config: Schema<ImageConfig> = Schema.object({
  maxConcurrentPerUser: Schema.string("Concurrent generations per user")
    .key("image.config.maxConcurrentPerUser")
    .default("2"),
  requestTimeoutMs: Schema.string("Generation timeout (milliseconds)")
    .key("image.config.requestTimeoutMs")
    .default("180000"),
  pollIntervalMs: Schema.string("Polling interval for asynchronous providers (milliseconds)")
    .key("image.config.pollIntervalMs")
    .default("2000"),
  maxImagesPerTask: Schema.string("Most images in one task")
    .key("image.config.maxImagesPerTask")
    .default("4"),
});

type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface ImageTaskRow {
  id: string;
  user_id: number;
  channel_id: number;
  channel_name: string;
  model_name: string;
  upstream_model_name: string;
  operation: string;
  prompt: string;
  negative_prompt: string;
  size: string;
  quality: string;
  style: string;
  count: number;
  seed: number | null;
  reference_file_id: string;
  status: TaskStatus | string;
  error_message: string;
  file_ids: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

declare module "@yumerijs/types" {
  interface Tables {
    image_tasks: ImageTaskRow;
  }
}

const MAX_PROMPT = 4000;
const MAX_NEGATIVE = 2000;

/** What the page sends; the same shape it gets back for a task. */
export interface ImageTaskInput {
  prompt: string;
  negativePrompt?: string;
  channelId?: number;
  model?: string;
  size?: string;
  quality?: string;
  style?: string;
  count?: number;
  seed?: number | null;
  referenceFileId?: string;
}

const sizePattern = /^\d{2,5}x\d{2,5}$/;

/**
 * A file name that says what the picture is, without giving the filesystem a
 * say: a prompt can contain slashes, colons and every kind of quote.
 */
function fileNameFor(prompt: string, index: number, extension: string) {
  const stem = prompt
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .slice(0, 40)
    .trim()
    .replace(/\s+/g, "-");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  return `${stem || "image"}-${stamp}-${index + 1}.${extension}`;
}

/** The picture's own bytes are the only trustworthy source for its type. */
function sniffImage(bytes: Buffer): { mime: string; extension: string } {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return { mime: "image/png", extension: "png" };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
    return { mime: "image/webp", extension: "webp" };
  if (bytes.length > 4 && bytes.toString("ascii", 0, 3) === "GIF") return { mime: "image/gif", extension: "gif" };
  return { mime: "image/png", extension: "png" };
}

/** Settings columns come back as 0/1 from SQLite and as booleans elsewhere. */
function enabledFlag(value: unknown) {
  if (value === undefined || value === null) return true;
  return !(value === false || value === 0 || value === "0" || value === "false");
}

function upstreamMessage(body: unknown): string {
  const value = body && typeof body === "object" ? (body as Record<string, any>) : {};
  for (const candidate of [
    value.error?.message,
    value.error?.code,
    value.message,
    value.code,
    value.output?.message,
    value.output?.code,
  ]) {
    const text = String(candidate ?? "").trim();
    if (text) return text;
  }
  return "";
}

/** Providers that answer with a task to poll (DashScope's image synthesis does). */
function asyncTaskID(body: unknown): string {
  const value = body && typeof body === "object" ? (body as Record<string, any>) : {};
  return String(value.output?.task_id ?? value.task_id ?? "").trim();
}

export async function apply(ctx: Context, cfg: ImageConfig) {
  ctx.i18n({
    image: {
      settings: { zh: "图片生成", en: "Image studio", ja: "画像スタジオ" },
      config: {
        maxConcurrentPerUser: { zh: "每用户并发生成数", en: "Generations per user", ja: "ユーザーあたりの並行生成数" },
        requestTimeoutMs: { zh: "生成超时（毫秒）", en: "Generation timeout (ms)", ja: "生成タイムアウト（ミリ秒）" },
        pollIntervalMs: { zh: "异步任务轮询间隔（毫秒）", en: "Async polling interval (ms)", ja: "非同期ポーリング間隔（ミリ秒）" },
        maxImagesPerTask: { zh: "单次最多生成张数", en: "Most images per task", ja: "1回の最大生成枚数" },
      },
    },
  });
  const db = ctx.component.database as Database;
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/image.js", import.meta.url).pathname,
    plugin: "image",
  });
  await db.extend(
    "image_tasks",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      channel_id: { type: "integer", initial: 0 },
      channel_name: { type: "string", initial: "" },
      model_name: { type: "string", initial: "" },
      upstream_model_name: { type: "string", initial: "" },
      operation: { type: "string", initial: "generate" },
      prompt: "text",
      negative_prompt: "text",
      size: { type: "string", initial: "" },
      quality: { type: "string", initial: "" },
      style: { type: "string", initial: "" },
      count: { type: "integer", initial: 1 },
      seed: { type: "integer", initial: 0 },
      reference_file_id: { type: "string", initial: "" },
      status: { type: "string", initial: "queued" },
      error_message: "text",
      file_ids: "text",
      created_at: "timestamp",
      started_at: "timestamp",
      finished_at: "timestamp",
      updated_at: "timestamp",
    },
    { primary: "id" },
  );

  const adapters = ctx.component.adapters as AdapterRegistry;
  const chat = ctx.component["advanced-chat"] as AdvancedChatService;
  const maxConcurrent = Math.max(1, Number(cfg.maxConcurrentPerUser) || 2);
  const requestTimeoutMs = Math.max(5000, Number(cfg.requestTimeoutMs) || 180000);
  const pollIntervalMs = Math.max(250, Number(cfg.pollIntervalMs) || 2000);
  const maxImages = Math.max(1, Math.min(10, Number(cfg.maxImagesPerTask) || 4));

  // A run lives in this process, so anything left over belongs to a process that
  // is gone: reporting it as failed beats a task that stays "running" forever.
  await db
    .update(
      "image_tasks",
      { status: "running" },
      { status: "failed", error_message: "Interrupted by a server restart", updated_at: new Date().toISOString() },
    )
    .catch(() => 0);

  const userOf = (session: Session) =>
    (session.properties.user as { id?: number } | undefined)?.id;

  const fileRows = async (userId: number, ids: string[]) => {
    if (!ids.length) return [];
    const rows: any[] = await db.select("advanced_chat_files", {
      user_id: userId,
      id: { $in: ids },
    });
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      return [{
        id: row.id,
        name: row.name,
        type: row.mime_type,
        size: row.size,
        download_url: `/api/user/advanced-chat/files/${encodeURIComponent(String(row.id))}/download`,
      }];
    });
  };

  const parseFileIds = (value: unknown): string[] => {
    try {
      const parsed = JSON.parse(String(value ?? "[]"));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };

  const response = async (row: ImageTaskRow) => {
    const ids = parseFileIds(row.file_ids);
    return {
      id: row.id,
      status: row.status,
      model: row.model_name,
      channel_id: Number(row.channel_id ?? 0),
      channel_name: row.channel_name,
      operation: row.operation,
      prompt: row.prompt,
      negative_prompt: row.negative_prompt,
      size: row.size,
      quality: row.quality,
      style: row.style,
      count: Number(row.count ?? 1),
      seed: row.seed === null || row.seed === undefined ? null : Number(row.seed),
      reference_file_id: row.reference_file_id,
      error_message: row.error_message,
      files: await fileRows(row.user_id, ids),
      created_at: row.created_at,
      started_at: row.started_at,
      finished_at: row.finished_at,
    };
  };

  /** The channel and its model binding for a request, or a reason it cannot run. */
  const resolveTarget = async (userId: number, input: ImageTaskInput) => {
    const model = String(input.model ?? "").trim();
    const channelId = Number(input.channelId ?? 0) || 0;
    const catalog = await db.selectOne("models", { model_name: model });
    if (!model) throw Error("Choose a model");
    if (!catalog) throw Error(`Model ${model} is not in the catalog`);
    const configs = (await db.select("model_configs", { model_id: Number(catalog.id), enabled: true })) as ModelConfig[];
    const channels = (await db.select("channels", { enabled: true })) as Channel[];
    const byId = new Map(channels.map((channel) => [Number(channel.id), channel]));
    const candidates = configs
      .map((config) => ({ config, channel: byId.get(Number(config.channel_id)) }))
      .filter((entry): entry is { config: ModelConfig; channel: Channel } => Boolean(entry.channel));
    const picked = channelId
      ? candidates.find((entry) => Number(entry.channel.id) === channelId)
      : candidates[0];
    if (!picked) throw Error(`No enabled channel serves ${model}; pick another model or channel`);
    return {
      channel: picked.channel,
      upstreamModel: String(picked.config.upstream_model_name ?? "").trim() || model,
      modelName: (catalog as Model).model_name,
    };
  };

  const readImageBytes = async (image: GeneratedImage): Promise<Buffer> => {
    if (image.base64) return Buffer.from(image.base64, "base64");
    if (image.url) {
      if (!/^https?:\/\//i.test(image.url)) throw Error("The provider returned an unusable image link");
      const response = await fetch(image.url, { signal: AbortSignal.timeout(requestTimeoutMs) });
      if (!response.ok) throw Error(`The provider's image link failed (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    }
    throw Error("The provider returned an image with neither bytes nor a link");
  };

  /**
   * Asynchronous providers answer a generation with a task id. DashScope is the
   * one in this build that does, and it polls under a fixed path; a provider
   * that does it differently needs `parseImage` on its adapter instead.
   */
  const pollAsync = async (channel: Channel, taskId: string) => {
    const url = upstreamURL(channel.base_url, `/api/v1/tasks/${encodeURIComponent(taskId)}`);
    const deadline = Date.now() + requestTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${channel.api_key || ""}` },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const body = await response.json().catch(() => ({}));
      const status = String((body as any)?.output?.task_status ?? "").toUpperCase();
      if (status === "SUCCEEDED") return adapters.parseImage(channel.type, body);
      if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN")
        throw Error(upstreamMessage(body) || `The provider reported ${status.toLowerCase()}`);
    }
    throw Error("The provider did not finish the image in time");
  };

  const generate = async (task: ImageTaskRow) => {
    const startedAt = new Date().toISOString();
    await db.update("image_tasks", { id: task.id }, { status: "running", started_at: startedAt, updated_at: startedAt });
    try {
      const channel = (await db.selectOne("channels", { id: Number(task.channel_id), enabled: true })) as Channel | undefined;
      if (!channel) throw Error("The channel that serves this model is disabled");

      let reference: string | undefined;
      if (task.reference_file_id) {
        const row: any = await db.selectOne("advanced_chat_files", {
          id: task.reference_file_id,
          user_id: task.user_id,
        });
        if (!row) throw Error("The reference image is no longer in the file library");
        if (!String(row.mime_type ?? "").startsWith("image/")) throw Error("The reference file is not an image");
        const files = ctx.component.file as { read(name: string): Promise<Buffer> };
        const bytes = await files.read(String(row.storage_path));
        reference = `data:${row.mime_type};base64,${bytes.toString("base64")}`;
      }

      const input: AdapterInput = {
        operation: reference ? "image_edit" : "image_generate",
        channelType: channel.type,
        model: task.upstream_model_name || task.model_name,
        apiKey: channel.api_key || "",
        stream: false,
        messages: [],
        media: {
          prompt: task.prompt,
          negativePrompt: task.negative_prompt || undefined,
          size: task.size || undefined,
          n: Number(task.count) || 1,
          quality: task.quality || undefined,
          style: task.style || undefined,
          seed: task.seed === null || task.seed === undefined ? undefined : Number(task.seed),
          referenceImage: reference,
        },
      };
      const built = adapters.build(input);
      if (!built) throw Error(`No adapter is registered for channel type ${channel.type}`);

      const response = await fetch(upstreamURL(channel.base_url, built.urlPath), {
        method: "POST",
        headers: built.headers,
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(upstreamMessage(body) || `The provider failed (${response.status})`);

      let result = adapters.parseImage(channel.type, body);
      const asyncId = asyncTaskID(body);
      if (!result.images.length && asyncId) result = await pollAsync(channel, asyncId);
      if (!result.images.length) throw Error(result.message || "The provider returned no image");

      const saved: string[] = [];
      const images = result.images.slice(0, maxImages);
      for (const [index, image] of images.entries()) {
        const bytes = await readImageBytes(image);
        const sniffed = sniffImage(bytes);
        const mime = image.mimeType?.startsWith("image/") ? image.mimeType : sniffed.mime;
        const extension = mime === sniffed.mime ? sniffed.extension : mime.split("/")[1] || "png";
        const stored = await chat.saveGeneratedFile(task.user_id, {
          name: fileNameFor(task.prompt, index, extension),
          mimeType: mime,
          data: bytes,
          source: "image_generation",
          sourceKey: `${task.id}:${index}`,
        });
        saved.push(String(stored.id));
      }
      const finishedAt = new Date().toISOString();
      await db.update(
        "image_tasks",
        { id: task.id },
        { status: "completed", file_ids: JSON.stringify(saved), error_message: "", finished_at: finishedAt, updated_at: finishedAt },
      );
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      await db.update(
        "image_tasks",
        { id: task.id },
        { status: "failed", error_message: message.slice(0, 2000), finished_at: finishedAt, updated_at: finishedAt },
      );
    }
  };

  // A queue per process: the rows hold the state, this only decides what runs
  // now. A user's extra submissions wait instead of hammering the provider.
  const active = new Map<number, number>();
  const waiting: string[] = [];
  let pumping = false;
  const start = (row: ImageTaskRow) => {
    const userId = Number(row.user_id);
    active.set(userId, (active.get(userId) ?? 0) + 1);
    void generate(row)
      .catch(() => undefined)
      .finally(() => {
        active.set(userId, Math.max(0, (active.get(userId) ?? 1) - 1));
        void pump();
      });
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      // One pass starts everything that is allowed to run; a task that had to
      // wait is picked up again when a run finishes.
      for (let index = 0; index < waiting.length; index += 1) {
        const row = (await db.selectOne("image_tasks", { id: waiting[index] })) as ImageTaskRow | undefined;
        if (!row || row.status !== "queued") {
          waiting.splice(index, 1);
          index -= 1;
          continue;
        }
        if ((active.get(Number(row.user_id)) ?? 0) >= maxConcurrent) continue;
        waiting.splice(index, 1);
        index -= 1;
        start(row);
      }
    } finally {
      pumping = false;
    }
  };

  // Tasks that were still waiting when the process stopped are ours again: the
  // queue itself lives in memory, so nothing else would ever pick them up.
  const leftover = (await db.select("image_tasks", { status: "queued" })) as ImageTaskRow[];
  leftover.sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  for (const row of leftover) waiting.push(row.id);
  if (leftover.length) void pump();

  const body = async (session: Session) =>
    (await session.parseRequestBody()) as Record<string, unknown>;

  ctx
    .route("/api/image/tasks")
    .methods("GET")
    .action(async (session: Session) => {
      const userId = userOf(session);
      if (userId === undefined) return;
      const rows = (await db.select("image_tasks", { user_id: userId })) as ImageTaskRow[];
      rows.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
      const tasks = [];
      for (const row of rows.slice(0, 60)) tasks.push(await response(row));
      session.respond({ tasks }, "json");
    });

  ctx
    .route("/api/image/tasks")
    .methods("POST")
    .action(async (session: Session) => {
      const userId = userOf(session);
      if (userId === undefined) return;
      const input = (await body(session)) as unknown as ImageTaskInput;

      const settings: any = await db.selectOne("advanced_chat_user_settings", { user_id: userId });
      // Generated pictures are stored as library files, so an account that
      // turned file storage off has nowhere to put them.
      if (settings && !enabledFlag(settings.file_storage_enabled)) {
        session.status = 400;
        session.respond({ error: "File storage is disabled, so generated images cannot be saved" }, "json");
        return;
      }

      const prompt = String(input.prompt ?? "").trim();
      if (!prompt) {
        session.status = 400;
        session.respond({ error: "A prompt is required" }, "json");
        return;
      }
      const negativePrompt = String(input.negativePrompt ?? "").trim().slice(0, MAX_NEGATIVE);
      const size = String(input.size ?? "").trim();
      if (size && !sizePattern.test(size)) {
        session.status = 400;
        session.respond({ error: "Size must be written as width x height, for example 1024x1024" }, "json");
        return;
      }
      const count = Math.max(1, Math.min(maxImages, Math.trunc(Number(input.count) || 1)));
      const seedValue = input.seed === null || input.seed === undefined ? undefined : Math.trunc(Number(input.seed));
      if (seedValue !== undefined && (!Number.isFinite(seedValue) || seedValue < 0)) {
        session.status = 400;
        session.respond({ error: "Seed must be a whole number of zero or more" }, "json");
        return;
      }
      const referenceFileId = String(input.referenceFileId ?? "").trim();
      if (referenceFileId) {
        const reference: any = await db.selectOne("advanced_chat_files", {
          id: referenceFileId,
          user_id: userId,
        });
        if (!reference) {
          session.status = 400;
          session.respond({ error: "The reference image is not in your file library" }, "json");
          return;
        }
        if (!String(reference.mime_type ?? "").startsWith("image/")) {
          session.status = 400;
          session.respond({ error: "The reference file is not an image" }, "json");
          return;
        }
      }

      let target;
      try {
        target = await resolveTarget(userId, input);
      } catch (error) {
        session.status = 400;
        session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
        return;
      }

      const now = new Date().toISOString();
      const id = `img-${randomUUID()}`;
      const row = (await db.create("image_tasks", {
        id,
        user_id: userId,
        channel_id: Number(target.channel.id) || 0,
        channel_name: String(target.channel.name ?? ""),
        model_name: target.modelName,
        upstream_model_name: target.upstreamModel,
        operation: referenceFileId ? "edit" : "generate",
        prompt: prompt.slice(0, MAX_PROMPT),
        negative_prompt: negativePrompt,
        size,
        quality: String(input.quality ?? "").trim().slice(0, 40),
        style: String(input.style ?? "").trim().slice(0, 40),
        count,
        seed: seedValue ?? null,
        reference_file_id: referenceFileId,
        status: "queued",
        error_message: "",
        file_ids: "[]",
        created_at: now,
        started_at: null,
        finished_at: null,
        updated_at: now,
      })) as ImageTaskRow;

      waiting.push(id);
      void pump();
      session.status = 201;
      session.respond(await response(row), "json");
    });

  ctx
    .route("/api/image/tasks/:id")
    .methods("GET")
    .action(async (session: Session, _params, taskId) => {
      const userId = userOf(session);
      if (userId === undefined) return;
      const row = (await db.selectOne("image_tasks", { id: taskId, user_id: userId })) as ImageTaskRow | undefined;
      if (!row) {
        session.status = 404;
        session.respond({ error: "Task not found" }, "json");
        return;
      }
      session.respond(await response(row), "json");
    });

  ctx
    .route("/api/image/tasks/:id")
    .methods("DELETE")
    .action(async (session: Session, _params, taskId) => {
      const userId = userOf(session);
      if (userId === undefined) return;
      const row = (await db.selectOne("image_tasks", { id: taskId, user_id: userId })) as ImageTaskRow | undefined;
      if (!row) {
        session.status = 404;
        session.respond({ error: "Task not found" }, "json");
        return;
      }
      if (row.status === "running") {
        session.status = 409;
        session.respond({ error: "This generation is still running" }, "json");
        return;
      }
      // The pictures stay in the file library: the task only remembered that it
      // made them.
      await db.remove("image_tasks", { id: taskId, user_id: userId });
      session.respond({ message: "Task removed" }, "json");
    });
}
