import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/config/env";

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicAppUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/categories", "/about", "/rules", "/terms", "/privacy"],
        disallow: ["/admin", "/checkout", "/api", "/submit?boost="],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
