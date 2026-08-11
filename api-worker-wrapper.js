"use strict";
/**
 * Loads the NestJS API entry point inside a Worker thread.
 *
 * Mirrors web-worker-wrapper.js's reasoning exactly: running jokas-api as a
 * Worker thread (rather than a child process via spawn()) keeps it under
 * start.js's own PID. Hostinger's 30-second child-process lifetime limiter
 * targets processes with their own PID — Worker threads are exempt because
 * they share the parent process's PID and are invisible to OS-level PID
 * monitors. Confirmed live 2026-08-11: apps/api's spawn()-based launch was
 * crash-looping in production roughly every 30s (exit code=0, not OOM —
 * same signature diagnosed for Next.js on 2026-07-29 in commit d50d406,
 * which only ever fixed the web process, not the API).
 */
const { workerData, parentPort } = require("worker_threads");

// ── process.cwd fix ────────────────────────────────────────────────────────
// main.ts and several controllers (hr, public, uploads) resolve their
// uploads directory via process.cwd() — previously guaranteed correct by
// launch()'s `cwd: path.join(root, "apps/api")` spawn option. Worker threads
// have no equivalent cwd option and inherit start.js's own cwd (the repo
// root) by default, which would silently move where uploaded files land.
// process.chdir is also a throwing stub inside Worker threads (same
// ERR_WORKER_UNSUPPORTED_OPERATION as web-worker-wrapper.js hit for Next.js)
// — neutralize it defensively even though main.ts doesn't call it today.
const _apiDir = workerData.apiDir;
try { process.chdir = () => {}; } catch {}
try { process.cwd = () => _apiDir; } catch {}

// ── process.exit intercept ─────────────────────────────────────────────────
// Prevent an uncaught exception (or an explicit shutdown) in the API from
// killing the Passenger-managed start.js process. Notify the main thread
// instead so it can call worker.terminate() and restart.
process.exit = (code) => {
  try { parentPort.postMessage({ type: "exit", code: code ?? 1 }); } catch {}
};

// ── stdout/stderr forwarding ───────────────────────────────────────────────
// Forward API output to the main thread so start.js can populate
// lastApiLines for /__status diagnostics, same as web/storefront already do.
const _origOut = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, enc, cb) => {
  try { parentPort.postMessage({ type: "log", data: String(chunk) }); } catch {}
  return _origOut(chunk, enc, cb);
};
const _origErr = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, enc, cb) => {
  try { parentPort.postMessage({ type: "log", data: "[ERR] " + String(chunk) }); } catch {}
  return _origErr(chunk, enc, cb);
};

// PORT is already set via the Worker env option in start.js.
// Load the NestJS entry point — starts listening on process.env.PORT.
require(workerData.apiScript);
