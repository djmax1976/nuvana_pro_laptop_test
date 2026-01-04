"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useMenuPermissions } from "@/hooks/useMenuPermissions";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Package,
  Ticket,
  Users,
  UserCheck,
  Shield,
  BarChart3,
  Bot,
  Settings,
  Wrench,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

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
 * All possible navigation items for the client dashboard
 * Visibility is controlled by the useMenuPermissions hook based on user permissions
 */
const ALL_NAV_ITEMS: NavItem[] = [
  // Dashboard - Core navigation
  {
    title: "Dashboard",
    href: "/client-dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  // Shift Management: View and manage individual shifts, open new shifts, and reconcile cash
  {
    title: "Shift Management",
    href: "/client-dashboard/shifts",
    icon: Clock,
  },
  // Daily Summary: View day reconciliations, daily summaries, and shift totals for a given day
  {
    title: "Daily Summary",
    href: "/client-dashboard/shift-and-day",
    icon: CalendarDays,
  },
  // Inventory: View and manage store inventory
  {
    title: "Inventory",
    href: "/client-dashboard/inventory",
    icon: Package,
  },
  // Lottery: Manage lottery packs and reconciliation
  {
    title: "Lottery",
    href: "/client-dashboard/lottery",
    icon: Ticket,
  },
  // Employees: Manage store employees
  {
    title: "Employees",
    href: "/client-dashboard/employees",
    icon: Users,
  },
  // Cashiers: Manage cashier accounts
  {
    title: "Cashiers",
    href: "/client-dashboard/cashiers",
    icon: UserCheck,
  },
  // Roles & Permissions: Customize role permissions (CLIENT_ROLE_MANAGE required)
  {
    title: "Roles & Permissions",
    href: "/client-dashboard/roles",
    icon: Shield,
  },
  // Reports: View various reports
  {
    title: "Reports",
    href: "/client-dashboard/reports",
    icon: BarChart3,
  },
  // Configuration: Manage lookup tables (tender types, departments, tax rates)
  {
    title: "Configuration",
    href: "/client-dashboard/config",
    icon: Wrench,
  },
  // AI Assistant: AI-powered assistance
  {
    title: "AI Assistant",
    href: "/client-dashboard/ai",
    icon: Bot,
  },
  // Settings: Account and store settings
  {
    title: "Settings",
    href: "/client-dashboard/settings",
    icon: Settings,
  },
];

/**
 * Client-specific sidebar component with permission-based menu visibility
 *
 * Shows navigation items based on the user's assigned permissions.
 * Menu items are filtered using the centralized menu-permissions configuration.
 *
 * SECURITY NOTE:
 * This is UI-level filtering for better UX. Backend APIs independently
 * enforce authorization - users cannot access restricted features
 * even if they manipulate the UI.
 *
 * @see src/config/menu-permissions.ts for permission mappings
 * @see src/hooks/useMenuPermissions.ts for filtering logic
 */
export function ClientSidebar({ className, onNavigate }: ClientSidebarProps) {
  const pathname = usePathname();
  const { permissions } = useClientAuth();
  const { filterNavItems } = useMenuPermissions(permissions);

  // Filter navigation items based on user permissions
  // Memoized to prevent recalculation on every render
  const visibleNavItems = useMemo(() => {
    return filterNavItems(ALL_NAV_ITEMS);
  }, [filterNavItems]);

  return (
    <div
      className={cn(
        "flex h-full w-64 flex-col border-r bg-background",
        className,
      )}
      data-testid="client-sidebar-navigation"
    >
      <div className="flex h-16 items-center border-b px-6">
        <h2
          className="text-heading-3 font-bold text-foreground"
          data-testid="sidebar-brand-name"
        >
          Nuvana
        </h2>
      </div>
      <nav
        className="flex-1 space-y-1 px-3 py-4"
        data-testid="client-sidebar-nav"
      >
        {visibleNavItems.map((item) => {
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

/**
 * Export ALL_NAV_ITEMS for testing purposes
 * This allows tests to verify filtering logic against the full item set
 */
export { ALL_NAV_ITEMS };
