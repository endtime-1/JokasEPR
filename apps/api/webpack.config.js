// NestJS webpack config — bundles the entire API into one file.
// Only @prisma/client and .prisma/* stay external because start.js
// restores them from the build-time backup at runtime.
module.exports = function (options) {
  return {
    ...options,
    externals: [
      function ({ request }, callback) {
        if (
          request === "@prisma/client" ||
          request === ".prisma/client" ||
          (request && request.startsWith(".prisma/"))
        ) {
          return callback(null, "commonjs " + request);
        }
        callback();
      },
    ],
  };
};
