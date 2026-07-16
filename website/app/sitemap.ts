import type { MetadataRoute } from "next";

const origin = "https://super-bash-folds.spry-crumb-3668.chatgpt.site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/play/index.html`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${origin}/credits`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
