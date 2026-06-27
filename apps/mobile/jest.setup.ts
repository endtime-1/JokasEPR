// Suppress known noise from RN Animated and React 19 concurrent-mode warnings
// that do not indicate real test failures.
const originalError = console.error.bind(console);
const SUPPRESSED = [
  "not wrapped in act",
  "not configured to support act",
  "overlapping act() calls",
  "act(async () => ...) without await",
];
console.error = (message: unknown, ...args: unknown[]) => {
  if (typeof message === "string" && SUPPRESSED.some((s) => message.includes(s))) return;
  originalError(message, ...args);
};
