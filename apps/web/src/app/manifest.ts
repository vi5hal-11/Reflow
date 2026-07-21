import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reflow",
    short_name: "Reflow",
    description: "A daily planner that heals itself when the day falls apart.",
    id: "/",
    start_url: "/today",
    display: "standalone",
    background_color: "#FAF8F2",
    theme_color: "#FAF8F2",
    orientation: "portrait",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // OS share sheet → straight into the inbox (CLAUDE.md §6).
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Today", url: "/today" },
      { name: "Inbox", url: "/inbox" },
    ],
  };
}
