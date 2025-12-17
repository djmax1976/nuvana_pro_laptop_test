"use client";

/**
 * SessionExpirationGuard Component
 *
 * Enterprise-grade session expiration handling component that provides:
 * - Real-time session monitoring across all authenticated areas
 * - Graceful warning modal before session expires
 * - Automatic redirect to login on expiration
 * - "Stay Logged In" option to extend session
 * - Cross-tab synchronization
 *
 * 2025 UX Best Practices:
 * - Non-intrusive countdown warning (not blocking work)
 * - Clear visual indication of time remaining
 * - One-click session extension
 * - Preserves user work context on redirect
 *
 * Usage:
 * Wrap any authenticated layout with this component:
 * <SessionExpirationGuard>
 *   {children}
 * </SessionExpirationGuard>
 */

import { useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  useSessionMonitor,
  type SessionStatus,
} from "@/hooks/useSessionMonitor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, LogOut, RefreshCw } from "lucide-react";

interface SessionExpirationGuardProps {
  children: ReactNode;
  /**
   * Redirect path after session expiration
   * @default "/login"
   */
  loginPath?: string;
  /**
   * Enable/disable the guard (useful for public routes)
   * @default true
   */
  enabled?: boolean;
  /**
   * Custom message for the warning modal
   */
  warningMessage?: string;
}

/**
 * Format milliseconds into human-readable time string
 */
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "0:00";

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  return `0:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get urgency level based on time remaining
 */
function getUrgencyLevel(ms: number): "low" | "medium" | "high" | "critical" {
  if (ms <= 30 * 1000) return "critical"; // 30 seconds
  if (ms <= 60 * 1000) return "high"; // 1 minute
  if (ms <= 2 * 60 * 1000) return "medium"; // 2 minutes
  return "low";
}

export function SessionExpirationGuard({
  children,
  loginPath = "/login",
  enabled = true,
  warningMessage = "Your session is about to expire due to inactivity.",
}: SessionExpirationGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showModal, setShowModal] = useState(false);
  const [isExtending, setIsExtending] = useState(false);

  const {
    status,
    timeRemaining,
    showWarning,
    isRefreshing,
    refreshSession,
    dismissWarning,
    forceLogout,
  } = useSessionMonitor({
    enabled,
    onSessionExpired: () => {
      // Store the current path for redirect after re-login
      try {
        sessionStorage.setItem("redirect_after_login", pathname);
      } catch {
        // Ignore storage errors
      }
    },
    onSessionWarning: () => {
      setShowModal(true);
    },
  });

  // Sync modal visibility with warning state
  useEffect(() => {
    if (showWarning && !showModal) {
      setShowModal(true);
    }
  }, [showWarning, showModal]);

  // Handle session extension
  const handleExtendSession = useCallback(async () => {
    setIsExtending(true);
    try {
      const success = await refreshSession();
      if (success) {
        setShowModal(false);
        dismissWarning();
      }
    } finally {
      setIsExtending(false);
    }
  }, [refreshSession, dismissWarning]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    setShowModal(false);
    await forceLogout();
  }, [forceLogout]);

  // Handle modal dismiss (continue without extending)
  const handleDismiss = useCallback(() => {
    setShowModal(false);
    dismissWarning();
  }, [dismissWarning]);

  // Determine urgency for styling
  const urgency = timeRemaining ? getUrgencyLevel(timeRemaining) : "low";
  const timeString = timeRemaining
    ? formatTimeRemaining(timeRemaining)
    : "0:00";

  // Get urgency color class based on level
  const getUrgencyColor = (level: string): string => {
    switch (level) {
      case "critical":
        return "text-red-600 animate-pulse";
      case "high":
        return "text-red-500";
      case "medium":
        return "text-orange-500";
      case "low":
      default:
        return "text-yellow-600";
    }
  };

  const urgencyColor = getUrgencyColor(urgency);

  return (
    <>
      {children}

      {/* Session Expiration Warning Modal */}
      <Dialog open={showModal && enabled} onOpenChange={setShowModal}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Session Expiring Soon
            </DialogTitle>
            <DialogDescription className="pt-2">
              {warningMessage}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Clock className="h-4 w-4" />
              <span>Time remaining:</span>
            </div>
            <div className={`text-4xl font-bold tabular-nums ${urgencyColor}`}>
              {timeString}
            </div>
            {urgency === "critical" && (
              <p className="text-sm text-red-500 mt-2 text-center">
                You will be logged out automatically when the timer reaches
                zero.
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleDismiss}
              disabled={isExtending}
              className="w-full sm:w-auto"
            >
              Continue Without Extending
            </Button>
            <Button
              variant="default"
              onClick={handleExtendSession}
              disabled={isExtending || isRefreshing}
              className="w-full sm:w-auto bg-primary"
            >
              {isExtending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Extending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Stay Logged In
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={isExtending}
              className="w-full sm:w-auto"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Optional: Floating countdown indicator when warning is shown but modal dismissed */}
      {showWarning && !showModal && timeRemaining && timeRemaining > 0 && (
        <div
          className="fixed bottom-4 right-4 z-50 bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700 rounded-lg shadow-lg p-3 cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
          onClick={() => setShowModal(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setShowModal(true)}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Session expires in{" "}
              <span className={`font-bold ${urgencyColor}`}>{timeString}</span>
            </span>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Click to extend session
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Higher-order component version for class components or external usage
 */
export function withSessionExpirationGuard<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  guardProps?: Omit<SessionExpirationGuardProps, "children">,
) {
  return function WithSessionGuard(props: P) {
    return (
      <SessionExpirationGuard {...guardProps}>
        <WrappedComponent {...props} />
      </SessionExpirationGuard>
    );
  };
}
