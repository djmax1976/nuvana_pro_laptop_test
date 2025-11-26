"use client";

import { useState } from "react";
import { ClientSidebar } from "./ClientSidebar";
import { Header } from "./Header";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface ClientDashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Client Dashboard Layout component
 * Provides layout structure for client-facing dashboard with restricted navigation
 * Only shows client-appropriate features (no system-level management)
 */
export function ClientDashboardLayout({
  children,
}: ClientDashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="flex h-screen overflow-hidden"
      data-testid="client-dashboard-layout"
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block">
        <ClientSidebar />
      </aside>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="w-64 p-0"
          onInteractOutside={() => setSidebarOpen(false)}
        >
          <SheetTitle className="sr-only">Client Navigation Menu</SheetTitle>
          <SheetDescription className="sr-only">
            Main navigation menu for client dashboard
          </SheetDescription>
          <ClientSidebar onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header with Menu Button and User Info */}
        <div className="lg:hidden">
          <div className="flex h-16 items-center justify-between border-b bg-background px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              data-testid="client-sidebar-toggle"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-heading-3 font-bold text-foreground">
              My Store
            </h2>
            <div className="flex-1" />
            <div className="flex items-center">
              <Header />
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:block">
          <Header />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
