"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { useStoreTerminals, TerminalWithStatus } from "@/lib/api/stores";
import { useMenuPermissions } from "@/hooks/useMenuPermissions";
import {
  LayoutDashboard,
  Clock,
  Loader2,
  AlertCircle,
  Ticket,
} from "lucide-react";
import { TerminalAuthModal } from "@/components/terminals/TerminalAuthModal";

interface MyStoreSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

/**
 * MyStore Terminal Dashboard Sidebar component
 * Shows terminal links, Clock In/Out link, and Lottery Management link
 *
 * @requirements
 * - AC #2: Sidebar shows terminal links for associated store, Clock In/Out link, and Lottery link
 * - AC #5: Shows terminals for stores user has access to (RLS filtering at API level)
 */
export function MyStoreSidebar({ className, onNavigate }: MyStoreSidebarProps) {
  const pathname = usePathname();
  const { user, permissions } = useClientAuth();
  const { canAccessMenuByKey } = useMenuPermissions(permissions);
  const { data: dashboardData, isLoading: dashboardLoading } =
    useClientDashboard();

  // State for terminal authentication modal
  const [selectedTerminal, setSelectedTerminal] =
    useState<TerminalWithStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Get first store ID from user's accessible stores
  const firstStoreId =
    dashboardData?.stores.find((s) => s.status === "ACTIVE")?.store_id ||
    dashboardData?.stores[0]?.store_id ||
    undefined;

  // Fetch terminals for the first store
  const {
    data: terminals,
    isLoading: terminalsLoading,
    isError: terminalsError,
  } = useStoreTerminals(firstStoreId, {
    enabled: !!firstStoreId && !dashboardLoading,
  });

  // Determine if Dashboard link is active (exact match only)
  const isDashboardActive = pathname === "/mystore";

  // Determine if Clock In/Out link is active
  const isClockInOutActive = pathname === "/mystore/clock-in-out";

  // Determine if Lottery link is active
  const isLotteryActive = pathname === "/mystore/lottery";

  // Extract terminal ID from pathname if on a terminal page
  // Matches: /terminal/{terminalId}/shift or /terminal/{terminalId}/*
  const activeTerminalId = pathname.startsWith("/terminal/")
    ? pathname.split("/")[2]
    : null;

  // Show lottery link using centralized menu permission configuration
  // Uses the same permission logic as ClientSidebar for consistency
  const showLotteryLink = canAccessMenuByKey("lottery");

  // Handle terminal click - open authentication modal
  const handleTerminalClick = (terminal: TerminalWithStatus) => {
    setSelectedTerminal(terminal);
    setIsModalOpen(true);
    onNavigate?.();
  };

  // Handle modal close
  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setSelectedTerminal(null);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full w-64 flex-col border-r bg-background",
        className,
      )}
      data-testid="mystore-sidebar"
    >
      <div className="flex h-16 items-center border-b px-6">
        <h2 className="text-heading-3 font-bold text-foreground">Nuvana</h2>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {/* Dashboard Link */}
        <Link
          href="/mystore"
          data-testid="dashboard-link"
          onClick={() => onNavigate?.()}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isDashboardActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span>Dashboard</span>
        </Link>

        {/* Clock In/Out Link */}
        <Link
          href="/mystore/clock-in-out"
          data-testid="clock-in-out-link"
          onClick={() => onNavigate?.()}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isClockInOutActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Clock className="h-5 w-5" />
          <span>Clock In/Out</span>
        </Link>

        {/* Lottery Management Link - Only for STORE_MANAGER */}
        {showLotteryLink && (
          <Link
            href="/mystore/lottery"
            data-testid="lottery-link"
            onClick={() => onNavigate?.()}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isLotteryActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Ticket className="h-5 w-5" />
            <span>Lottery</span>
          </Link>
        )}

        {/* Terminal Links Section */}
        <div className="mt-4 space-y-1">
          {dashboardLoading || terminalsLoading ? (
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
              data-testid="terminals-loading"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading terminals...</span>
            </div>
          ) : terminalsError ? (
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm text-destructive"
              data-testid="terminals-error"
            >
              <AlertCircle className="h-4 w-4" />
              <span>Failed to load terminals</span>
            </div>
          ) : !terminals || terminals.length === 0 ? (
            <div
              className="px-3 py-2 text-sm text-muted-foreground"
              data-testid="terminals-empty"
            >
              No terminals available
            </div>
          ) : (
            terminals.map((terminal) => {
              // Generate terminal link testid
              const terminalTestId = `terminal-link-${terminal.pos_terminal_id}`;
              // Check if this terminal is currently selected (URL-based)
              const isTerminalActive =
                activeTerminalId === terminal.pos_terminal_id;
              return (
                <button
                  key={terminal.pos_terminal_id}
                  data-testid={terminalTestId}
                  onClick={() => handleTerminalClick(terminal)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                    isTerminalActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-accent-foreground/30 hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span className="flex-1 truncate">{terminal.name}</span>
                  {/* Show badge only when terminal has an active shift */}
                  {terminal.has_active_shift && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        isTerminalActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                      )}
                      title={
                        terminal.active_shift_cashier_name
                          ? `Active shift: ${terminal.active_shift_cashier_name}`
                          : "Active shift"
                      }
                    >
                      {terminal.active_shift_cashier_name || "Active"}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </nav>

      {/* Terminal Authentication Modal */}
      {selectedTerminal && firstStoreId && (
        <TerminalAuthModal
          terminalId={selectedTerminal.pos_terminal_id}
          terminalName={selectedTerminal.name}
          storeId={firstStoreId}
          open={isModalOpen}
          onOpenChange={handleModalClose}
        />
      )}
    </div>
  );
}
