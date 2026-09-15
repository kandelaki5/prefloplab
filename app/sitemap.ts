import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { SPOTS, spotSlug } from "@/lib/spots";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/range`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    ...SPOTS.map((s) => ({
      url: `${SITE_URL}/range/${spotSlug(s)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
