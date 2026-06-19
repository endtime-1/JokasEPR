const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo (needed for shared packages)
config.watchFolders = [monorepoRoot];

// Resolve packages from the project first, then from the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Use symlinked paths (logical paths) instead of real paths in the pnpm store.
// This makes AppEntry.js resolve ../../App relative to the symlink at
// apps/mobile/node_modules/expo/ → apps/mobile/App.tsx (correct)
// instead of .pnpm/expo@.../node_modules/expo/ → .pnpm/expo@.../App (not found)
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
