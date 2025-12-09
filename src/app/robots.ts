import { MetadataRoute } from "next";

/**
 * Dynamic robots.txt generation for Nuvana Pro
 *
 * This generates robots.txt dynamically, allowing environment-specific rules.
 * Currently configured to BLOCK all crawling during development.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://nuvana.pro"
  ).replace(/\/+$/, "");
  const isProduction =
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_INDEXING === "true";

  // Block all crawling during development/staging
  if (!isProduction) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
    };
  }

  // Production rules (when ALLOW_INDEXING=true)
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/admin/",
          "/settings/",
          "/profile/",
          "/_next/",
          "/static/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
