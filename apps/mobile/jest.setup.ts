// Suppress the "not wrapped in act" noise from RN's TouchableOpacity animation.
// These warnings fire when Animated timers run outside act() in the test renderer
// and do not indicate real test failures.
const originalError = console.error.bind(console);
console.error = (message: unknown, ...args: unknown[]) => {
  if (typeof message === "string" && message.includes("not wrapped in act")) return;
  originalError(message, ...args);
};
