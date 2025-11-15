import "./globals.css";

// Force all pages to be dynamically rendered
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Nuvana Pro</title>
        <meta
          name="description"
          content="Enterprise store management platform"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
