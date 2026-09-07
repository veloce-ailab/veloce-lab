import { promises as fs } from "node:fs";
import path from "node:path";
import { Context, Schema } from "yumeri";

export interface FileOptions {
  root: string;
}
export interface FileService {
  root: string;
  read(name: string): Promise<Buffer>;
  write(name: string, data: string | Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  exists(name: string): Promise<boolean>;
}

export const depend: string[] = [];
export const provide = ["file"];
export const config: Schema<FileOptions> = Schema.object({
  root: Schema.string("File storage root").default("./data"),
});

declare module "yumeri" {
  interface Components {
    file: FileService;
  }
}

function resolveFile(root: string, name: string) {
  const target = path.resolve(root, name);
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error("File path escapes storage root");
  return target;
}

export async function apply(ctx: Context, pluginConfig: FileOptions) {
  const root = path.resolve(pluginConfig.root);
  await fs.mkdir(root, { recursive: true });
  const service: FileService = {
    root,
    read: (name) => fs.readFile(resolveFile(root, name)),
    async write(name, data) {
      const target = resolveFile(root, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
    },
    async remove(name) {
      await fs.rm(resolveFile(root, name), { force: true });
    },
    async exists(name) {
      try {
        await fs.access(resolveFile(root, name));
        return true;
      } catch {
        return false;
      }
    },
  };
  ctx.registerComponent("file", service);
}
