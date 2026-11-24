"use client";

// Attendance scanner. Scan an employee ID card (phone camera, or a USB/Bluetooth scanner that types the code) and the
// person is marked present for the day, Monday to Saturday. A second scan the same day only says it is already marked.
// The camera keeps scanning card after card. The server decides what each scan means and refuses any code that was not
// issued by this system.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { ApiEnvelope, apiFetch } from "../lib/api";

type ScanResult = {
  action: "MARKED" | "ALREADY_MARKED";
  at: string;
  markedAt: string | null;
  employee: { id: string; code: string; fullName: string; photoUrl: string | null; roleName: string | null; locationName: string | null };
};
type Outcome = { id: number; tone: "in" | "info" | "error"; headline: string; detail: string; name?: string; role?: string | null; photo?: string; time: string };

const TONE: Record<Outcome["tone"], string> = {
  in: "border-green-300 bg-green-50 text-green-900",
  info: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-300 bg-red-50 text-red-800"
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
function photoSrc(url: string | null | undefined) {
  if (!url) return undefined;
  if (url.startsWith("/api/v1/uploads/")) return url;
  if (url.startsWith("/uploads/")) return `/api/v1${url}`;
  if (!url.includes("/")) return `/api/v1/uploads/employees/${url}`;
  return url;
}

export function describeScan(r: ScanResult): Pick<Outcome, "tone" | "headline" | "detail"> {
  if (r.action === "MARKED") return { tone: "in", headline: "Attendance marked", detail: `Present for today, at ${clock(r.at)}` };
  return { tone: "info", headline: "Already marked", detail: `You have marked your attendance for today${r.markedAt ? ` (at ${clock(r.markedAt)})` : ""}.` };
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type JsQr = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: string }) => { data: string } | null;

// Browsers without a built-in QR detector (iPhone Safari, Firefox) use jsQR, a small open-source decoder (Apache-2.0)
// kept in /vendor and loaded only when it is needed.
async function loadJsQr(): Promise<JsQr> {
  const w = window as unknown as { jsQR?: JsQr };
  if (w.jsQR) return w.jsQR;
  await new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "/vendor/jsQR.js";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("decoder"));
    document.head.appendChild(el);
  });
  if (!w.jsQR) throw new Error("decoder");
  return w.jsQR;
}

function jsQrDetector(decode: JsQr): Detector {
  const canvas = document.createElement("canvas");
  return {
    detect: async (video) => {
      const scale = Math.min(1, 640 / Math.max(video.videoWidth || 640, 1));
      const width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
      const height = Math.max(1, Math.round((video.videoHeight || 480) * scale));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return [];
      ctx.drawImage(video, 0, 0, width, height);
      const found = decode(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "dontInvert" });
      return found ? [{ rawValue: found.data }] : [];
    }
  };
}

export function AttendanceScanPage() {
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraNote, setCameraNote] = useState("");
  const [markedCount, setMarkedCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCode = useRef({ code: "", at: 0 });
  const counter = useRef(0);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const beep = useCallback((ok: boolean) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      osc.frequency.value = ok ? 880 : 240;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
    } catch { /* sound is a nicety only */ }
  }, []);

  const submit = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const stamp = new Date().toISOString();
    let outcome: Outcome;
    try {
      const res = await apiFetch<ApiEnvelope<ScanResult>>("/hr/attendance/scan", { method: "POST", body: JSON.stringify({ code }) });
      const d = res.data;
      outcome = { id: ++counter.current, ...describeScan(d), name: d.employee.fullName, role: [d.employee.roleName, d.employee.locationName].filter(Boolean).join(" · "), photo: photoSrc(d.employee.photoUrl), time: d.at };
      beep(d.action === "MARKED");
      if (d.action === "MARKED") setMarkedCount((n) => n + 1);
    } catch (e) {
      outcome = { id: ++counter.current, tone: "error", headline: "Not recorded", detail: e instanceof Error ? e.message : "Could not record this scan.", time: stamp };
      beep(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    setOutcomes((prev) => [outcome, ...prev].slice(0, 12));
    setManual("");
    inputRef.current?.focus();
  }, [beep]);

  // Camera scanning uses the browser's own QR detector (Chrome, Edge and Android). Elsewhere the typing box below works
  // with any scanner that types, or by pasting the code.
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  async function startCamera() {
    setCameraNote("");
    const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraNote("This browser cannot use the camera here (it needs a secure https page). Use a USB scanner, or paste the code below.");
      return;
    }
    let detector: Detector;
    try {
      detector = Native ? new Native({ formats: ["qr_code"] }) : jsQrDetector(await loadJsQr());
    } catch {
      setCameraNote("The scanning helper could not be loaded. Check the connection and try again, or use the typing box below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOn(true);
      const tick = async () => {
        const video = videoRef.current;
        if (!streamRef.current) return;
        // The video box appears a moment after the camera opens; wait for it instead of giving up.
        if (!video) {
          setTimeout(tick, 100);
          return;
        }
        if (video.readyState >= 2 && !busyRef.current) {
          try {
            const found = await detector.detect(video);
            const code = found[0]?.rawValue;
            const now = Date.now();
            if (code && (code !== lastCode.current.code || now - lastCode.current.at > 4000)) {
              lastCode.current = { code, at: now };
              void submit(code);
            }
          } catch { /* a frame that cannot be read is skipped */ }
        }
        setTimeout(tick, 250);
      };
      void tick();
    } catch {
      setCameraNote("The camera could not be opened. Allow camera access for this site, or use the typing box below.");
    }
  }

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [cameraOn]);
  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  // Open the camera straight away so the person at the gate can just point it at cards, one after another.
  useEffect(() => {
    void startCamera();
  }, []);

  const latest = outcomes[0];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Attendance scanner</h1>
        <p className="mt-1 text-sm text-ink/60">Point the camera at an ID card's QR code. The person is marked present for the day . Keep scanning, one card after another.</p>
        {markedCount > 0 && <p className="mt-1 text-sm font-semibold text-green-700">{markedCount} marked since this page was opened</p>}
      </div>

      <div className="app-card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {cameraOn ? (
            <button type="button" onClick={stopCamera} className="app-button-secondary"><CameraOff className="h-4 w-4" aria-hidden /> Stop camera</button>
          ) : (
            <button type="button" onClick={startCamera} className="app-button-primary"><Camera className="h-4 w-4" aria-hidden /> Scan with camera</button>
          )}
          {cameraNote && <span className="text-sm text-amber-700">{cameraNote}</span>}
        </div>
        {cameraOn && <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-md bg-black object-cover" />}
        <form onSubmit={(e) => { e.preventDefault(); void submit(manual); }} className="flex gap-2">
          <label className="sr-only" htmlFor="card-code">Card code</label>
          <input
            id="card-code"
            ref={inputRef}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Scanner types here, or paste the card code"
            autoComplete="off"
            className="min-h-11 flex-1 rounded-md border border-line px-3 text-sm"
          />
          <button type="submit" disabled={busy || !manual.trim()} className="app-button-primary"><ScanLine className="h-4 w-4" aria-hidden /> Record</button>
        </form>
      </div>

      {latest && (
        <div className={`flex items-center gap-4 rounded-xl border-2 p-4 ${TONE[latest.tone]}`} role="status" aria-live="polite">
          {latest.name && (
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/70 text-2xl font-bold">
              {latest.photo ? <img src={latest.photo} alt="" className="h-full w-full object-cover" /> : latest.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-3xl font-extrabold leading-tight">{latest.headline}</p>
            {latest.name && <p className="mt-1 text-lg font-semibold">{latest.name}</p>}
            {latest.role && <p className="text-sm opacity-80">{latest.role}</p>}
            <p className="mt-1 text-sm">{latest.detail}</p>
          </div>
        </div>
      )}

      {outcomes.length > 1 && (
        <div className="app-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink/70">Recent scans</h2>
          <ul className="divide-y divide-line text-sm">
            {outcomes.slice(1).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{o.name ?? "Unknown card"}</span>
                <span className={o.tone === "error" ? "text-red-700" : "text-ink/70"}>{o.headline} · {o.tone === "error" ? o.detail : clock(o.time)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
