export function stripUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(stripUndefinedDeep) as unknown as T;
    }

    if (value && typeof value === "object") {
        const out: any = {};
        for (const [k, v] of Object.entries(value as any)) {
            if (v === undefined) continue;
            out[k] = stripUndefinedDeep(v);
        }
        return out;
    }

    return value;
}