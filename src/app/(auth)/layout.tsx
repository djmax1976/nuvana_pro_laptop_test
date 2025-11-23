"use client";

/**
 * Minimal layout for authentication pages
 * No sidebar or header - clean authentication experience
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
