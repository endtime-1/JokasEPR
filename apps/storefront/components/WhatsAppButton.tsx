import { MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/contact";

// Floating "chat with us" button, bottom-right on every page. A plain link, so
// it works without JavaScript and needs no tracking script.
export default function WhatsAppButton() {
  return (
    <a
      href={whatsappLink("Hello Akoko Feeds, I would like to place an order / ask about your products.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Akoko Feeds on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-[0_6px_24px_rgba(37,211,102,0.45)] transition hover:scale-105 hover:bg-[#1ebe5a] active:scale-95"
    >
      <MessageCircle size={20} aria-hidden />
      <span className="hidden sm:inline">Order on WhatsApp</span>
    </a>
  );
}
