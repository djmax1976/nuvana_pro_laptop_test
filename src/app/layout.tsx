import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/providers/query-provider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
// DISABLED: ThemeSync causing issues - will be fixed later
// import { ThemeSync } from "@/components/providers/ThemeSync";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";

// Force all pages to be dynamically rendered
export const dynamic = "force-dynamic";

// Enterprise-grade metadata configuration
export const metadata: Metadata = {
  // Primary metadata
  title: {
    default: "Nuvana Pro",
    template: "%s | Nuvana Pro",
  },
  description:
    "Enterprise store management platform for multi-location retail operations. Real-time analytics, role-based access control, and comprehensive reporting.",

  // Application information
  applicationName: "Nuvana Pro",
  authors: [{ name: "Nuvana", url: "https://nuvana.pro" }],
  generator: "Next.js",
  keywords: [
    "store management",
    "retail operations",
    "enterprise software",
    "multi-store management",
    "retail analytics",
    "POS management",
    "inventory management",
  ],

  // Robots/crawling - BLOCKING all indexing during development
  // When ready for production, set ALLOW_INDEXING=true and update these values
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },

  // Icons are auto-discovered from icon.svg, apple-icon.tsx
  // manifest.json is served from public/manifest.json

  // Open Graph metadata for social sharing
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nuvana.pro",
    siteName: "Nuvana Pro",
    title: "Nuvana Pro - Enterprise Store Management",
    description:
      "Enterprise store management platform for multi-location retail operations.",
    // Images are auto-generated from opengraph-image.tsx
  },

  // Twitter Card metadata
  twitter: {
    card: "summary_large_image",
    title: "Nuvana Pro - Enterprise Store Management",
    description:
      "Enterprise store management platform for multi-location retail operations.",
    // creator: "@nuvana", // Add when you have a Twitter handle
    // Images are auto-generated from twitter-image.tsx
  },

  // App-specific metadata
  category: "business",

  // Verification (add these when you set up search console)
  // verification: {
  //   google: "your-google-verification-code",
  //   yandex: "your-yandex-verification-code",
  // },

  // Manifest link
  manifest: "/manifest.json",

  // Other metadata
  other: {
    "msapplication-TileColor": "#0f172a",
  },
};

// Viewport configuration (separated in Next.js 14+)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        <ThemeProvider>
          <AuthProvider>
            <QueryProvider>
              {/* DISABLED: ThemeSync causing issues - will be fixed later */}
              {/* <ThemeSync /> */}
              {children}
              <Toaster />
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
