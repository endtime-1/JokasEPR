function readPackage(pkg) {
  if (pkg.name === 'esbuild') {
    pkg.pnpm = pkg.pnpm || {};
    pkg.pnpm.allowBuild = true;
    pkg.scripts = {};
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
