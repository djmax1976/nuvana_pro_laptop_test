"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";

/**
 * Dashboard layout for authenticated pages
 * Uses DashboardLayout component with sidebar and header
 */
export default function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
