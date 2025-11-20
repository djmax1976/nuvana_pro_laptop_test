import "./globals.css";
import { QueryProvider } from "@/lib/providers/query-provider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeSync } from "@/components/providers/ThemeSync";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";

// Force all pages to be dynamically rendered
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Nuvana Pro</title>
        <meta
          name="description"
          content="Enterprise store management platform"
        />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <QueryProvider>
              <ThemeSync />
              {children}
              <Toaster />
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
