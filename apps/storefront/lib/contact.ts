// Public contact details for the akokofeeds.com site. WhatsApp wants digits
// only, with the country code and no leading 0 or +.
export const WHATSAPP_NUMBER = "233505455055";
export const WHATSAPP_DISPLAY = "050 545 5055";

export function whatsappLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
