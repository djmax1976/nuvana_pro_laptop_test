"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCog,
  Store,
  Clock,
  Package,
  Ticket,
  BarChart3,
  Bot,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItemWithRole extends NavItem {
  roles?: string[]; // Roles that can see this item (undefined = all roles)
}

const allNavItems: NavItemWithRole[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Clients",
    href: "/clients",
    icon: Users,
    roles: ["SYSTEM_ADMIN"], // System Admin only
  },
  {
    title: "Companies",
    href: "/companies",
    icon: Building2,
    roles: ["SYSTEM_ADMIN"], // System Admin only
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: UserCog,
    roles: ["SYSTEM_ADMIN"], // System Admin only - ADMIN_SYSTEM_CONFIG permission
  },
  {
    title: "Stores",
    href: "/stores",
    icon: Store,
    roles: ["CORPORATE_ADMIN", "STORE_MANAGER"], // Corporate Admin and Store Manager
  },
  {
    title: "Shifts",
    href: "/dashboard/shifts",
    icon: Clock,
  },
  {
    title: "Inventory",
    href: "/dashboard/inventory",
    icon: Package,
  },
  {
    title: "Lottery",
    href: "/dashboard/lottery",
    icon: Ticket,
  },
  {
    title: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
  },
  {
    title: "AI Assistant",
    href: "/dashboard/ai",
    icon: Bot,
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  // TODO: Get user roles from authentication context
  // For now, show all items - role-based filtering will be implemented
  // when authentication context is available
  const userRoles: string[] = []; // Placeholder - will be populated from auth context
  const hasRole = (roles?: string[]) => {
    if (!roles || roles.length === 0) return true; // No role restriction = visible to all
    // If userRoles is empty (not yet implemented), show all items for development
    if (userRoles.length === 0) return true;
    return roles.some((role) => userRoles.includes(role));
  };

  // Filter nav items based on user roles
  const navItems = allNavItems.filter((item) => hasRole(item.roles));

  return (
    <div
      className={cn(
        "flex h-full w-64 flex-col border-r bg-background",
        className,
      )}
      data-testid="sidebar-navigation"
    >
      <div className="flex h-16 items-center border-b px-6">
        <h2 className="text-heading-3 font-bold text-foreground">Nuvana Pro</h2>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-link-${item.title.toLowerCase()}`}
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
