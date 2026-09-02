import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Schema } from 'yumeri';
export const depend = ['velocelab-core'];
export const provide = ['file'];
export const config = Schema.object({ root: Schema.string('File storage root').default('./data') });
function resolveFile(root, name) {
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(`${root}${path.sep}`))
        throw new Error('File path escapes storage root');
    return target;
}
export async function apply(ctx, pluginConfig) {
    const root = path.resolve(pluginConfig.root);
    await fs.mkdir(root, { recursive: true });
    const service = {
        root,
        read: (name) => fs.readFile(resolveFile(root, name)),
        async exists(name) { try {
            await fs.access(resolveFile(root, name));
            return true;
        }
        catch {
            return false;
        } },
    };
    ctx.registerComponent('file', service);
}
