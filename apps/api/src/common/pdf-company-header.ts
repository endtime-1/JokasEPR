import type { CompanyBranding } from "./company-branding";
import { applyLetterhead } from "./pdf-letterhead";

/**
 * Starts a document on the company letterhead (logo, contact details and the
 * orange frame come from the artwork on every page) and writes the document
 * title at the top of the body, leaving the cursor ready for the rest of the
 * content. Branding is kept in the signature for callers; the letterhead
 * itself carries the company identity.
 */
export function renderCompanyPdfHeader(doc: PDFKit.PDFDocument, _branding: CompanyBranding, documentTitle: string) {
  applyLetterhead(doc);
  const x = doc.x;
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#000").text(documentTitle, x, doc.y);
  doc.moveTo(x, doc.y + 3).lineTo(doc.page.width - doc.page.margins.right, doc.y + 3).lineWidth(1).strokeColor("#FF8533").stroke();
  doc.x = x;
  doc.y += 12;
  doc.fillColor("#000");
}
