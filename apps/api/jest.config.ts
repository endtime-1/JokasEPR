import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.test.json" }]
  },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  coveragePathIgnorePatterns: ["src/main.ts"],
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/setup/env.ts"],
  moduleNameMapper: {
    "^@jokas/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
    "^@jokas/shared$": "<rootDir>/../../packages/shared/src",
    "^@jokas/db$": "<rootDir>/../../packages/db/src"
  }
};

export default config;
