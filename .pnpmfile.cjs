// esbuild's postinstall only verifies the binary — it doesn't install it.
// The binary arrives via @esbuild/linux-x64 (optional dep). Removing the
// scripts here prevents EACCES on restricted Linux hosts (e.g. Hostinger)
// and suppresses ERR_PNPM_IGNORED_BUILDS without needing pnpm approve-builds.
function readPackage(pkg) {
  if (pkg.name === 'esbuild') {
    pkg.scripts = {};
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
