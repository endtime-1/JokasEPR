// Public contact details for the akokofeeds.com site. WhatsApp wants digits
// only, with the country code and no leading 0 or +.
export const WHATSAPP_NUMBER = "233208120456";
export const WHATSAPP_DISPLAY = "+233 208 120 456";

export function whatsappLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
