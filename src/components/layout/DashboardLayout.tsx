"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="flex h-screen overflow-hidden"
      data-testid="dashboard-layout"
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar />
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
              data-testid="sidebar-toggle"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-heading-3 font-bold text-foreground">
              Nuvana Pro
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
