import { MetadataRoute } from "next";

/**
 * Dynamic sitemap generation for Nuvana Pro
 *
 * This generates a sitemap at build time or on-demand.
 * For enterprise SaaS, only public pages should be included.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://nuvana.pro";

  // Static pages that should be indexed
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.8,
    },
  ];

  // In the future, you could add dynamic pages here:
  // - Public store pages (if you have a public storefront)
  // - Blog posts (if you add a blog)
  // - Help/documentation pages

  return staticPages;
}
