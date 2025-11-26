"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Clock,
  Package,
  Ticket,
  Users,
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
 */
const clientNavItems: NavItem[] = [
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

interface ClientSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

/**
 * Client-specific sidebar component
 * Only shows navigation items appropriate for client users
 * No access to system-level management features
 */
export function ClientSidebar({ className, onNavigate }: ClientSidebarProps) {
  const pathname = usePathname();

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
              data-testid={`client-nav-link-${item.title.toLowerCase().replace(" ", "-")}`}
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
