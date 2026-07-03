// onlyBuiltDependencies marks esbuild as explicitly approved so pnpm does not
// raise ERR_PNPM_IGNORED_BUILDS. The readPackage hook then clears its scripts
// so the postinstall never executes — avoiding EACCES on restricted hosts.
// The binary still works: @esbuild/linux-x64 is installed as an optional dep.
function readPackage(pkg) {
  if (pkg.name === 'esbuild') {
    pkg.scripts = {};
  }
  return pkg;
}

module.exports = {
  hooks: { readPackage },
  onlyBuiltDependencies: ['esbuild'],
};
