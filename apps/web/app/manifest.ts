import type { MetadataRoute } from "next";

// Makes the ERP installable from Chrome / Edge ("Install app"): its own window and icon,
// no browser bars. Same code as the website, so every deploy updates it automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Akoko Solutions ERP",
    short_name: "Akoko ERP",
    description: "Akoko Solutions agribusiness ERP",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#16140F",
    theme_color: "#16140F",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
