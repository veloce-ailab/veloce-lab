export const depend = [];
export const provide = ["adapters"];
export function normalizeType(value) {
    return value.trim().toLowerCase().replaceAll(" ", "").replaceAll("-", "_");
}
export function apply(ctx) {
    const adapters = [];
    const find = (type) => [...adapters]
        .reverse()
        .find((item) => item.types.some((name) => normalizeType(name) === normalizeType(type)));
    ctx.registerComponent("adapters", {
        names: () => adapters.flatMap((adapter) => adapter.types),
        register(adapter) {
            adapters.push(adapter);
            return () => {
                const index = adapters.indexOf(adapter);
                if (index >= 0)
                    adapters.splice(index, 1);
            };
        },
        build: (input) => find(input.channelType)?.build(input),
        parse: (type, body) => find(type)?.parse?.(body),
        async stream(type, response, onDelta) {
            const handler = find(type)?.stream;
            if (!handler)
                return false;
            await handler(response, onDelta);
            return true;
        },
        normalizeType,
    });
}
