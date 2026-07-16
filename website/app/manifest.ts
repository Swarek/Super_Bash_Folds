import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Super Bash Folds",
    short_name: "Bash Folds",
    description: "An open-source browser platform fighter built around portable fighter and stage packs.",
    start_url: "/play/index.html",
    display: "standalone",
    background_color: "#101d33",
    theme_color: "#101d33",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
