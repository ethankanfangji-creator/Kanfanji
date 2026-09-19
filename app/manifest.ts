import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "看房記 KanFangJi",
    short_name: "看房記",
    description: "離線記錄看房重點、照片與影片筆記",
    start_url: "/",
    display: "standalone",
    background_color: "#FDF6F0",
    theme_color: "#111111",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
