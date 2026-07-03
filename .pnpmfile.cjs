function readPackage(pkg) {
  if (pkg.name === 'esbuild') {
    // Mark as explicitly approved so pnpm clears ERR_PNPM_IGNORED_BUILDS,
    // then clear scripts so the postinstall never runs (avoids EACCES).
    pkg.pnpm = pkg.pnpm || {};
    pkg.pnpm.allowBuild = true;
    pkg.scripts = {};
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
