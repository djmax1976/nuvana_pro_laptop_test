"use client";

import { useState, useCallback } from "react";
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
import { PageTitleProvider, usePageTitle } from "@/contexts/PageTitleContext";

interface ClientDashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Mobile Header Component (internal)
 *
 * Separated to access PageTitleContext for displaying page title on mobile.
 * This component is only rendered on mobile viewports.
 *
 * Security Considerations (SEC-004: XSS):
 * - All text content uses React's automatic escaping
 * - No dangerouslySetInnerHTML usage
 */
function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { title: pageTitle } = usePageTitle();

  return (
    <div className="flex h-16 items-center justify-between border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        data-testid="client-sidebar-toggle"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      {/* Center - Page Title on Mobile */}
      <div className="flex-1 flex justify-center">
        {pageTitle && (
          <h1
            className="text-lg font-semibold text-foreground truncate max-w-[200px]"
            data-testid="mobile-header-page-title"
          >
            {pageTitle}
          </h1>
        )}
      </div>
      {/* Right - Minimal header controls on mobile (controls-only variant) */}
      <div className="flex items-center">
        <Header variant="controls-only" />
      </div>
    </div>
  );
}

/**
 * Client Dashboard Layout component
 *
 * Provides layout structure for client-facing dashboard with restricted navigation.
 * Only shows client-appropriate features (no system-level management).
 *
 * Architecture:
 * - Wraps children with PageTitleProvider for centralized title management
 * - Page titles are displayed in the header bar, not in page content
 * - Supports both desktop and mobile responsive layouts
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - PageTitleContext stores only non-sensitive UI state
 * - No tokens or secrets are passed through the layout
 *
 * Performance Considerations (FE-020: REACT_OPTIMIZATION):
 * - Callbacks are memoized to prevent unnecessary re-renders
 * - Mobile header is a separate component to isolate context subscriptions
 */
export function ClientDashboardLayout({
  children,
}: ClientDashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Memoized handlers (FE-020: REACT_OPTIMIZATION)
  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <PageTitleProvider>
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
            onInteractOutside={handleCloseSidebar}
          >
            <SheetTitle className="sr-only">Client Navigation Menu</SheetTitle>
            <SheetDescription className="sr-only">
              Main navigation menu for client dashboard
            </SheetDescription>
            <ClientSidebar onNavigate={handleCloseSidebar} />
          </SheetContent>
        </Sheet>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile Header with Menu Button and Page Title */}
          <div className="lg:hidden">
            <MobileHeader onMenuClick={handleOpenSidebar} />
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
    </PageTitleProvider>
  );
}
