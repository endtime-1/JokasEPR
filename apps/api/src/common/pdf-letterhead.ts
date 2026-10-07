import { existsSync } from "fs";
import { join } from "path";

// Margins that keep body text clear of the letterhead's header band (logo,
// P.O. Box) and footer band (email, phone, address). Measured off the artwork.
export const LETTERHEAD_MARGINS = { top: 125, bottom: 70, left: 50, right: 50 };

// Bottom of the printable body area on A4 (841.89pt tall).
export const LETTERHEAD_MAX_Y = 841.89 - LETTERHEAD_MARGINS.bottom;

// Compiled output keeps this next to the module (nest-cli.json copies assets/);
// ts-jest runs from src/ where it sits in the same place.
const LETTERHEAD_PATH = join(__dirname, "assets", "letterhead.jpg");

/**
 * Puts the company letterhead behind the current page and every page added
 * later, and keeps body text inside the area the artwork leaves free. Call it
 * once, before writing any content. If the artwork is missing the document is
 * still produced (with the same margins) rather than failing.
 */
export function applyLetterhead(doc: PDFKit.PDFDocument) {
  const hasArt = existsSync(LETTERHEAD_PATH);
  const prepare = () => {
    doc.page.margins.top = LETTERHEAD_MARGINS.top;
    doc.page.margins.bottom = LETTERHEAD_MARGINS.bottom;
    doc.page.margins.left = LETTERHEAD_MARGINS.left;
    doc.page.margins.right = LETTERHEAD_MARGINS.right;
    if (hasArt) {
      try {
        doc.image(LETTERHEAD_PATH, 0, 0, { width: doc.page.width, height: doc.page.height });
      } catch {
        // Unreadable artwork — keep going with a plain page.
      }
    }
    doc.x = LETTERHEAD_MARGINS.left;
    doc.y = LETTERHEAD_MARGINS.top;
  };
  prepare();
  doc.on("pageAdded", prepare);
}
