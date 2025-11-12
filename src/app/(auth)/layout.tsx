import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication - Nuvana Pro",
  description: "Sign in to Nuvana Pro",
};

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
