import type { MetadataRoute } from "next";

/** Installable app ("Take MatchX on the go"): add to home screen on iPhone and Android. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MATCHX",
    short_name: "MATCHX",
    description: "Collect real English footballers, pick your seven and score from real matches.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    background_color: "#07080a",
    theme_color: "#07080a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
