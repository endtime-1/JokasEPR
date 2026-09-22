import { existsSync } from "fs";
import { join } from "path";
import type { CompanyBranding } from "./company-branding";

// Uploaded logos are served at /api/v1/uploads/<path> by UploadsController,
// which reads from process.cwd()/uploads — same process, so pdfkit can embed
// the file straight off disk instead of making an HTTP round trip to itself.
function resolveLocalUploadPath(url: string): string | null {
  const match = /\/api\/v1\/uploads\/(.+)$/.exec(url);
  if (!match) return null;
  const path = join(process.cwd(), "uploads", match[1]);
  return existsSync(path) ? path : null;
}

/**
 * Draws the standard branded header (logo + legal name + address + document
 * title) at the current cursor position and leaves the cursor below it,
 * ready for the rest of the document. Falls back to a text-only header if
 * no logo is configured, or the file can't be read.
 */
export function renderCompanyPdfHeader(doc: PDFKit.PDFDocument, branding: CompanyBranding, documentTitle: string) {
  const startY = doc.y;
  const startX = doc.x;
  let textX = startX;
  const logoPath = branding.logoUrl ? resolveLocalUploadPath(branding.logoUrl) : null;
  if (logoPath) {
    try {
      doc.image(logoPath, startX, startY, { fit: [52, 52] });
      textX = startX + 64;
    } catch {
      // Corrupt or unsupported image — fall through to a text-only header
      // rather than failing the whole PDF over a bad logo file.
    }
  }

  doc.fontSize(16).font("Helvetica-Bold").text(branding.legalName || branding.name, textX, startY, { width: 480 - (textX - startX) });
  if (branding.address) {
    doc.fontSize(9).font("Helvetica").fillColor("#555").text(branding.address, textX, doc.y, { width: 480 - (textX - startX) });
  }
  doc.fillColor("#000").fontSize(12).font("Helvetica-Bold").fillColor("#555").text(documentTitle, textX, doc.y + 2);
  doc.fillColor("#000");

  doc.x = startX;
  doc.y = Math.max(doc.y, startY + 60);
  doc.moveDown(0.6);
}
