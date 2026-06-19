import baseConfig from "../../eslint.config.mjs";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules
    },
    settings: {
      next: {
        rootDir: "."
      }
    }
  }
];
