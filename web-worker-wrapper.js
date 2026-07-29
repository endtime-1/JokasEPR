"use strict";
/**
 * Loads the Next.js standalone server inside a Worker thread.
 *
 * Running Next.js as a Worker thread (rather than a child process) keeps it
 * under start.js's PID. Hostinger's 30-second child-process lifetime limiter
 * targets processes with their own PID — Worker threads are exempt because
 * they share the parent process's PID and are invisible to OS-level PID
 * monitors.
 */
const { workerData, parentPort } = require("worker_threads");
const path = require("path");

// ── process.chdir / process.cwd fix ────────────────────────────────────────
// Node.js replaces process.chdir with a throwing stub in Worker threads
// (ERR_WORKER_UNSUPPORTED_OPERATION). Next.js standalone server.js calls
// process.chdir(__dirname) on its first line to set CWD for file resolution.
//
// Fix: replace the throwing stub with a no-op BEFORE requiring server.js, and
// also override process.cwd() to return the standalone directory. Next.js uses
// __dirname (absolute) for most asset paths, but some internal code falls back
// to process.cwd() — pointing it at the right directory is a safe precaution.
const _serverDir = path.dirname(workerData.serverScript);
try { process.chdir = () => {}; } catch {} // make chdir a no-op
try { process.cwd = () => _serverDir;  } catch {} // make cwd return the right dir

// ── process.exit intercept ─────────────────────────────────────────────────
// Prevent Next.js from killing the Passenger-managed start.js process.
// Notify the main thread instead so it can call worker.terminate() and restart.
process.exit = (code) => {
  try { parentPort.postMessage({ type: "exit", code: code ?? 1 }); } catch {}
};

// ── stdout/stderr forwarding ───────────────────────────────────────────────
// Forward Next.js output to the main thread so start.js can populate
// lastWebLines for /__status diagnostics.
// process.stdout here is this worker's own stream object — patching it does
// NOT affect the main thread's process.stdout. Writes still reach fd 1 normally.
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

// PORT, HOSTNAME, NODE_ENV are already set via the Worker env option in start.js.
// No further env mutations needed here.

// Load the Next.js standalone server — starts listening on process.env.PORT.
require(workerData.serverScript);
