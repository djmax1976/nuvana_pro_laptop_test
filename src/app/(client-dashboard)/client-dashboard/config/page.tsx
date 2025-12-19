"use client";

/**
 * Configuration Index Page
 *
 * Main entry point for store configuration options.
 *
 * Phase 6: Frontend & Admin UI
 */

import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings, CreditCard, FolderTree, Percent } from "lucide-react";

const configOptions = [
  {
    title: "Tender Types",
    description: "Manage payment methods accepted at checkout",
    href: "/client-dashboard/config/tender-types",
    icon: CreditCard,
  },
  {
    title: "Departments",
    description: "Organize products into categories for reporting",
    href: "/client-dashboard/config/departments",
    icon: FolderTree,
  },
  {
    title: "Tax Rates",
    description: "Configure tax rates for different product categories",
    href: "/client-dashboard/config/tax-rates",
    icon: Percent,
  },
];

export default function ConfigPage() {
  return (
    <div className="space-y-6" data-testid="client-config-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Configuration
        </h1>
        <p className="text-muted-foreground">
          Manage store settings and lookup tables
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {configOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Link key={option.href} href={option.href}>
              <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {option.title}
                  </CardTitle>
                  <CardDescription>{option.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
