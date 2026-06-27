const _store = new Map<string, string>();

export const getItem    = jest.fn(async (key: string) => _store.get(key) ?? null);
export const setItem    = jest.fn(async (key: string, value: string) => { _store.set(key, value); });
export const removeItem = jest.fn(async (key: string) => { _store.delete(key); });
export const clear      = jest.fn(async () => { _store.clear(); });
export const getAllKeys  = jest.fn(async () => [..._store.keys()]);
export const multiGet   = jest.fn(async (keys: string[]) => keys.map(k => [k, _store.get(k) ?? null] as [string, string | null]));
export const multiSet   = jest.fn(async (pairs: [string, string][]) => { pairs.forEach(([k, v]) => _store.set(k, v)); });

export function __reset() { _store.clear(); }

export default { getItem, setItem, removeItem, clear, getAllKeys, multiGet, multiSet };
