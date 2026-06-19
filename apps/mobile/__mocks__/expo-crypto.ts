let _counter = 0;

export const randomUUID = jest.fn(() => `mock-uuid-${++_counter}`);

export function __reset() {
  _counter = 0;
}
