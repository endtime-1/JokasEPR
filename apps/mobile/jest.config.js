/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
  transformIgnorePatterns: [
    // Works with both flat node_modules and pnpm's .pnpm virtual store.
    // The optional prefix (\\.pnpm/[^/]*/node_modules/)? handles paths like:
    //   node_modules/.pnpm/react-native@0.76.9_.../node_modules/react-native/...
    "node_modules/(?!(\\.pnpm/[^/]*/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
  setupFiles: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^expo-secure-store$": "<rootDir>/__mocks__/expo-secure-store.ts",
    "^expo-sqlite$": "<rootDir>/__mocks__/expo-sqlite.ts",
    "^expo-network$": "<rootDir>/__mocks__/expo-network.ts",
    "^expo-crypto$": "<rootDir>/__mocks__/expo-crypto.ts",
    "^@react-native-async-storage/async-storage$": "<rootDir>/__mocks__/async-storage.ts",
  },
};
