"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import {
  LayoutDashboard,
  Clock,
  Package,
  Ticket,
  Users,
  Shield,
  BarChart3,
  Bot,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

/**
 * Client Dashboard Navigation Items
 * Restricted to client-appropriate features only
 * Excludes: Clients, Companies, Users, Stores (system-level management)
 *
 * Note: "Roles & Permissions" is conditionally rendered based on CLIENT_ROLE_MANAGE permission
 */
const CLIENT_ROLE_MANAGE_PERMISSION = "CLIENT_ROLE_MANAGE";

/**
 * Generate a stable testid from a title string
 * Replaces all whitespace with hyphens, removes/replaces special characters,
 * and converts to lowercase for consistent testid generation
 */
function generateTestId(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace all whitespace (including multiple spaces) with hyphens
    .replace(/[&]/g, "and") // Replace & with "and"
    .replace(/[^a-z0-9-]/g, "") // Remove all non-alphanumeric characters except hyphens
    .replace(/-+/g, "-") // Replace multiple consecutive hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

interface ClientSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

/**
 * Client-specific sidebar component
 * Only shows navigation items appropriate for client users
 * No access to system-level management features
 *
 * SECURITY: The "Roles & Permissions" link is only rendered for users
 * with CLIENT_ROLE_MANAGE permission to prevent unauthorized access.
 * Server-side route guards in /api/client/roles enforce the same permission.
 */
export function ClientSidebar({ className, onNavigate }: ClientSidebarProps) {
  const pathname = usePathname();
  const { permissions } = useClientAuth();

  // Base navigation items (always visible to client users)
  const baseNavItems: NavItem[] = [
    {
      title: "Dashboard",
      href: "/client-dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      title: "Shifts",
      href: "/client-dashboard/shifts",
      icon: Clock,
    },
    {
      title: "Inventory",
      href: "/client-dashboard/inventory",
      icon: Package,
    },
    {
      title: "Lottery",
      href: "/client-dashboard/lottery",
      icon: Ticket,
    },
    {
      title: "Employees",
      href: "/client-dashboard/employees",
      icon: Users,
    },
  ];

  // Conditionally include "Roles & Permissions" only if user has CLIENT_ROLE_MANAGE permission
  const hasRoleManagePermission = permissions.includes(
    CLIENT_ROLE_MANAGE_PERMISSION,
  );

  // Additional navigation items (permission-based)
  const additionalNavItems: NavItem[] = [];
  if (hasRoleManagePermission) {
    additionalNavItems.push({
      title: "Roles & Permissions",
      href: "/client-dashboard/roles",
      icon: Shield,
    });
  }

  // Common navigation items (always visible)
  const commonNavItems: NavItem[] = [
    {
      title: "Reports",
      href: "/client-dashboard/reports",
      icon: BarChart3,
    },
    {
      title: "AI Assistant",
      href: "/client-dashboard/ai",
      icon: Bot,
    },
  ];

  // Combine all navigation items
  const clientNavItems = [
    ...baseNavItems,
    ...additionalNavItems,
    ...commonNavItems,
  ];

  return (
    <div
      className={cn(
        "flex h-full w-64 flex-col border-r bg-background",
        className,
      )}
      data-testid="client-sidebar-navigation"
    >
      <div className="flex h-16 items-center border-b px-6">
        <h2 className="text-heading-3 font-bold text-foreground">My Store</h2>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {clientNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`client-nav-link-${generateTestId(item.title)}`}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
