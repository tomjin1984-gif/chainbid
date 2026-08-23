import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/config/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getPublicAppUrl();
  return ["", "/categories", "/rules", "/terms", "/privacy", "/submit"].map((path) => ({
    url: `${origin}${path}`,
    lastModified: new Date(),
  }));
}
