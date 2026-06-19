const _store: Record<string, string> = {};

export const getItemAsync = jest.fn(async (key: string) => _store[key] ?? null);
export const setItemAsync = jest.fn(async (key: string, value: string) => {
  _store[key] = value;
});
export const deleteItemAsync = jest.fn(async (key: string) => {
  delete _store[key];
});

export function __reset() {
  Object.keys(_store).forEach((k) => delete _store[k]);
}
export function __set(key: string, value: string) {
  _store[key] = value;
}
export function __get(key: string) {
  return _store[key] ?? null;
}
