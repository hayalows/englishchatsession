import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://englishchatsession.vercel.app/",
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
