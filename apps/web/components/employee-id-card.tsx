"use client";

// The employee ID card (front and back) shown on the employee page, "ID card" tab. Printed at standard card size
// (54 x 86 mm, portrait). The QR code on the front holds a signed code; scanning it on HR > Scan card marks that
// person's attendance (first scan checks in, the next one checks out).
import { useEffect, useState } from "react";
import { Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { ConfirmModal } from "./ui";

type CardData = {
  id: string;
  code: string;
  fullName: string;
  firstName: string;
  lastName: string;
  status: string;
  startDate: string;
  photoUrl: string | null;
  roleName: string | null;
  locationName: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  companyName: string | null;
  companyLegalName: string | null;
  /** From Settings > Company profile. */
  companyAddress: string | null;
  companyLogoUrl: string | null;
  cardVersion: number;
  qrCode: string;
  qrSvg: string;
};

// ── Look of the card per company. The address and logo come from Settings > Company profile when set there;
// the values below are only the fallback for the logo, and the colour. ──
type Brand = {
  match: RegExp;
  name: string;
  /** Logo shown on the front. A file under apps/web/public. Null shows the name as text. */
  logo: string | null;
  accent: string;
  addressLines: string[];
  phone: string;
  email: string;
};

export const ID_CARD_BRANDS: Brand[] = [
  { match: /akoko/i, name: "Akoko Solutions", logo: "/brand/akoko-logo.svg", accent: "#e8680f", addressLines: [], phone: "", email: "" },
  { match: /jokas/i, name: "Jokas", logo: null, accent: "#e8680f", addressLines: [], phone: "", email: "" }
];
const DEFAULT_BRAND: Brand = { match: /./, name: "", logo: null, accent: "#e8680f", addressLines: [], phone: "", email: "" };

export function brandFor(companyName: string | null | undefined): Brand {
  const found = ID_CARD_BRANDS.find((b) => b.match.test(companyName ?? ""));
  return { ...(found ?? DEFAULT_BRAND), name: found?.name || companyName || "" };
}

function normalizePhotoUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/api/v1/uploads/")) return url;
  if (url.startsWith("/uploads/")) return `/api/v1${url}`;
  if (!url.includes("/")) return `/api/v1/uploads/employees/${url}`;
  return url;
}

function svgDataUrl(svg: string) {
  try {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } catch {
    return "";
  }
}

const shortDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
};
// Long names get a smaller type size so they always fit on at most two lines.
export const nameSize = (name: string) => (name.length <= 16 ? "4.6em" : name.length <= 24 ? "3.9em" : "3.3em");
const initials = (first: string, last: string) => `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();

// Everything on the card is sized in "em" where 1em = 1 mm on paper, so it prints at exactly 54 x 86 mm and the same
// design is simply scaled up for the screen.
const CARD_CSS = `
.idc-sheet{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
.idc{--a:#e8680f;position:relative;box-sizing:border-box;width:54em;height:86em;font-size:6px;border-radius:3.2em;overflow:hidden;background:#fff;color:#1f2933;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18);line-height:1.2}
.idc *{box-sizing:border-box}
.idc-top{position:absolute;inset:0 0 auto 0;height:20em;background:linear-gradient(135deg,#1f2933,#3b4754)}
.idc-top:after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.2em;background:var(--a)}
.idc-logo{position:absolute;top:2.6em;left:50%;transform:translateX(-50%);width:40em;height:11em;background:#fff8f1;border-radius:2.2em;display:flex;align-items:center;justify-content:center;overflow:hidden}
.idc-logo img{width:100%;height:100%;object-fit:contain}
.idc-logo b{font-size:4.2em;letter-spacing:.04em;text-transform:uppercase;color:#1f2933}
.idc-photo{position:absolute;top:15em;left:50%;transform:translateX(-50%);width:26em;height:31em;border-radius:2.6em;border:.8em solid #fff;background:#e5e7eb;overflow:hidden;box-shadow:0 .5em 1.6em rgba(0,0,0,.25);display:grid;place-items:center}
.idc-photo img{width:100%;height:100%;object-fit:cover}
.idc-photo span{font-size:8em;font-weight:800;color:#9aa4af}
.idc-who{position:absolute;top:48.2em;left:2em;right:2em;text-align:center}
.idc-name{font-weight:800;letter-spacing:-.01em;line-height:1.1}
.idc-role{margin-top:.6em;font-size:2.6em;font-weight:700;color:var(--a);text-transform:uppercase;letter-spacing:.05em;line-height:1.15}
.idc-loc{margin-top:.3em;font-size:2.3em;color:#5b6672}
.idc-foot{position:absolute;left:4em;right:4em;bottom:3.6em;display:flex;align-items:flex-end;justify-content:space-between;gap:2em}
.idc-meta dt{font-size:1.9em;text-transform:uppercase;letter-spacing:.08em;color:#8a95a1;margin:0}
.idc-meta dd{font-size:3em;font-weight:800;margin:0 0 1.2em}
.idc-meta dd.s{font-size:2.5em;font-weight:700;margin:0}
.idc-qr{width:15em;height:15em;background:#fff;border:.45em solid #1f2933;border-radius:1.1em;padding:.4em}
.idc-qr img{width:100%;height:100%;display:block}
.idc-bar{position:absolute;left:0;right:0;bottom:0;height:1.2em;background:var(--a)}
.idc-bhead{position:absolute;inset:0 0 auto 0;height:15em;background:linear-gradient(135deg,#1f2933,#3b4754);color:#fff;padding:4em 4em 0}
.idc-bhead:after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.2em;background:var(--a)}
.idc-bhead h3{margin:0;font-size:3.8em;font-weight:800;letter-spacing:.02em;text-transform:uppercase;line-height:1.1}
.idc-bhead p{margin:.6em 0 0;font-size:2.2em;color:#cfd6dd}
.idc-bbody{position:absolute;top:18em;left:4.5em;right:4.5em;bottom:14em;overflow:hidden}
.idc-sec{margin-bottom:3em}
.idc-sec h4{margin:0 0 .9em;font-size:1.9em;text-transform:uppercase;letter-spacing:.1em;color:var(--a);font-weight:800}
.idc-sec p{margin:0;font-size:2.5em;line-height:1.3}
.idc-sec p.m{color:#5b6672;font-size:2.1em}
.idc-sign{position:absolute;left:4.5em;right:4.5em;bottom:8em;border-top:.25em solid #1f2933;padding-top:.8em;font-size:2em;color:#5b6672;text-align:center}
.idc-bfoot{position:absolute;left:4.5em;right:4.5em;bottom:3.4em;font-size:1.9em;color:#8a95a1;text-align:center}
@media print{
  @page{size:54mm 86mm;margin:0}
  body *{visibility:hidden!important}
  .idc-sheet,.idc-sheet *{visibility:visible!important}
  .idc-sheet{position:fixed;left:0;top:0;display:block;gap:0}
  .idc{font-size:1mm;border-radius:0;box-shadow:none;break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .idc-noprint{display:none!important}
}
`;

type CardBrand = Brand & { companyLegalName?: string };

export function IdCardFace({ data, face, brand, issued }: { data: CardData; face: "front" | "back"; brand: CardBrand; issued: string }) {
  const photo = normalizePhotoUrl(data.photoUrl);
  const [photoBroken, setPhotoBroken] = useState(false);
  const style = { "--a": brand.accent } as React.CSSProperties;
  if (face === "front") {
    return (
      <div className="idc" style={style} data-face="front">
        <div className="idc-top" />
        <div className="idc-logo">{brand.logo ? <img src={brand.logo} alt={brand.name} /> : <b>{brand.name}</b>}</div>
        <div className="idc-photo">
          {photo && !photoBroken ? <img src={photo} alt={data.fullName} onError={() => setPhotoBroken(true)} /> : <span>{initials(data.firstName, data.lastName)}</span>}
        </div>
        <div className="idc-who">
          <div className="idc-name" style={{ fontSize: nameSize(data.fullName) }}>{data.fullName}</div>
          {data.roleName && <div className="idc-role">{data.roleName}</div>}
          {data.locationName && <div className="idc-loc">{data.locationName}</div>}
        </div>
        <div className="idc-foot">
          <dl className="idc-meta" style={{ margin: 0 }}>
            <dt>Staff ID</dt>
            <dd>{data.code}</dd>
            <dt>Joined</dt>
            <dd className="s">{shortDate(data.startDate)}</dd>
          </dl>
          <div className="idc-qr">{data.qrSvg && <img src={svgDataUrl(data.qrSvg)} alt="Attendance QR code" />}</div>
        </div>
        <div className="idc-bar" />
      </div>
    );
  }
  return (
    <div className="idc" style={style} data-face="back">
      <div className="idc-bhead">
        <h3>{brand.companyLegalName || brand.name}</h3>
        <p>Employee identification card</p>
      </div>
      <div className="idc-bbody">
        <div className="idc-sec">
          <h4>Address</h4>
          {brand.addressLines.length ? brand.addressLines.map((l) => <p key={l}>{l}</p>) : <p className="m">—</p>}
          {brand.phone && <p>Tel: {brand.phone}</p>}
          {brand.email && <p>{brand.email}</p>}
        </div>
        <div className="idc-sec">
          <h4>In case of emergency</h4>
          {data.emergencyContactName || data.emergencyContactPhone ? (
            <>
              <p>{data.emergencyContactName}</p>
              <p>{data.emergencyContactPhone}</p>
            </>
          ) : (
            <p className="m">—</p>
          )}
        </div>
        <div className="idc-sec">
          <h4>If found</h4>
          <p className="m">This card is the property of {brand.name || "the company"} and must be shown on request. If found, please return it to the address above.</p>
        </div>
      </div>
      <div className="idc-sign">Authorised signature</div>
      <div className="idc-bfoot">Issued {issued}</div>
      <div className="idc-bar" />
    </div>
  );
}



export function EmployeeIdCardTab({ id }: { id: string }) {
  const [data, setData] = useState<CardData | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [reissueError, setReissueError] = useState("");

  async function reissue() {
    setReissuing(true);
    setReissueError("");
    try {
      const r = await apiFetch<ApiEnvelope<CardData>>(`/hr/employees/${id}/id-card/reissue`, { method: "POST" });
      setData(r.data);
      setConfirmOpen(false);
    } catch (e) {
      setReissueError(e instanceof Error ? e.message : "Could not issue a new card.");
      setConfirmOpen(false);
    } finally {
      setReissuing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    apiFetch<ApiEnvelope<CardData>>(`/hr/employees/${id}/id-card`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the ID card."); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-ink/60">Loading ID card…</p>;

  const base = brandFor(data.companyName);
  const addressLines = (data.companyAddress ?? "").split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean);
  const brand: CardBrand = { ...base, logo: data.companyLogoUrl || base.logo, addressLines: addressLines.length ? addressLines : base.addressLines, companyLegalName: data.companyLegalName ?? undefined };
  const issued = new Date().toLocaleDateString("en-GH", { month: "short", year: "numeric" });
  const notices: string[] = [];
  if (!data.photoUrl) notices.push("No photo yet. Add one with the camera button on the employee's profile picture, then come back here.");
  if (!brand.addressLines.length) notices.push("The company address for the back of the card is not set yet. Add it in Settings > Company profile and it appears here.");
  if (data.status !== "ACTIVE") notices.push(`This employee is ${data.status.toLowerCase()}, so scanning this card will not record attendance.`);

  return (
    <div className="space-y-4">
      <style>{CARD_CSS}</style>
      <div className="idc-noprint flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">Print on a card printer or card-size paper. Page 1 is the front, page 2 the back.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirmOpen(true)} className="app-button-secondary" title="Use when a card is lost or stolen">
            <RefreshCw className="h-4 w-4" aria-hidden /> Replace card
          </button>
          <button type="button" onClick={() => window.print()} className="app-button-primary">
            <Printer className="h-4 w-4" aria-hidden /> Print ID card
          </button>
        </div>
      </div>
      {reissueError && <p className="idc-noprint rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{reissueError}</p>}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={reissue}
        title="Replace this ID card?"
        message={`The current card for ${data.fullName} stops working straight away (scanning it will be refused). A new QR code is made and the card shown here is the new one, ready to print.`}
        confirmLabel="Replace card"
        loading={reissuing}
      />
      {notices.length > 0 && (
        <div className="idc-noprint space-y-1 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notices.map((n) => (
            <p key={n} className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {n}</p>
          ))}
        </div>
      )}
      <div className="idc-sheet">
        <IdCardFace data={data} face="front" brand={brand} issued={issued} />
        <IdCardFace data={data} face="back" brand={brand} issued={issued} />
      </div>
    </div>
  );
}
