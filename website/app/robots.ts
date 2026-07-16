import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://super-bash-folds.spry-crumb-3668.chatgpt.site/sitemap.xml",
  };
}
