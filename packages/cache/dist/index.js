export const depend = ["velocelab-core", "config"];
export const provide = ["cache"];
export function apply(ctx) {
    const store = new Map();
    ctx.registerComponent("cache", {
        get: (key) => store.get(key),
        set: (key, value) => {
            store.set(key, value);
        },
        delete: (key) => {
            store.delete(key);
        },
    });
}
