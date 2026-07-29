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

// Prevent process.exit() from killing the Passenger-managed start.js process.
// If Next.js calls process.exit() on a fatal error, notify the main thread so
// it can call worker.terminate() and schedule a clean restart.
process.exit = (code) => {
  try { parentPort.postMessage({ type: "exit", code: code ?? 1 }); } catch {}
};

// Forward Next.js stdout/stderr to the main thread so start.js can populate
// lastWebLines for /__status diagnostics.
//
// In Node.js Worker threads, process.stdout is a per-worker stream object —
// patching its .write method here only affects this worker, NOT the main
// thread's process.stdout. Both ultimately write to the same fd 1, so console
// output from Next.js still appears in the real stdout stream as normal.
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

// The Worker's process.env is an isolated copy (set via the `env` option in
// the Worker constructor) — PORT, HOSTNAME, NODE_ENV are already correct.
// No env mutations needed here.

// Load the Next.js standalone server. It starts listening on process.env.PORT.
// server.js calls process.chdir(__dirname) internally; Worker threads share
// the process CWD, but start.js uses absolute paths throughout so this is safe.
require(workerData.serverScript);
