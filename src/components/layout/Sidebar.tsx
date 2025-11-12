"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
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

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Companies",
    href: "/dashboard/companies",
    icon: Building2,
  },
  {
    title: "Stores",
    href: "/dashboard/stores",
    icon: Store,
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
