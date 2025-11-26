"use client";

import { useClientAuth } from "@/contexts/ClientAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Store, Users, Activity, Loader2 } from "lucide-react";
import {
  useClientDashboard,
  OwnedCompany,
  OwnedStore,
} from "@/lib/api/client-dashboard";

/**
 * Status badge variant mapping
 */
const statusVariants: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "secondary"
> = {
  ACTIVE: "success",
  INACTIVE: "secondary",
  SUSPENDED: "destructive",
  PENDING: "warning",
  CLOSED: "destructive",
};

/**
 * Company card component
 */
function CompanyCard({ company }: { company: OwnedCompany }) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{company.name}</span>
        </div>
        {company.address && (
          <p className="text-sm text-muted-foreground">{company.address}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {company.store_count} store{company.store_count !== 1 ? "s" : ""}
        </p>
      </div>
      <Badge variant={statusVariants[company.status] || "default"}>
        {company.status}
      </Badge>
    </div>
  );
}

/**
 * Store card component
 */
function StoreCard({ store }: { store: OwnedStore }) {
  return (
    <div className="p-4 border rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{store.name}</span>
        </div>
        <Badge variant={statusVariants[store.status] || "default"}>
          {store.status}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{store.company_name}</p>
      {store.location_json?.address && (
        <p className="text-xs text-muted-foreground">
          {store.location_json.address}
        </p>
      )}
    </div>
  );
}

/**
 * Loading skeleton for stats cards
 */
function StatsLoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            <div className="h-4 w-4 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-12 bg-muted animate-pulse rounded mb-1" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Client Dashboard Home Page
 * Displays overview of client's companies, stores, and quick stats
 *
 * @requirements
 * - AC #5: Display client name, associated companies, stores, and quick stats
 * - Show active stores count and total employees
 */
export default function ClientDashboardPage() {
  const { user } = useClientAuth();
  const { data, isLoading, isError, error } = useClientDashboard();

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="client-dashboard-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
        <StatsLoadingSkeleton />
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6" data-testid="client-dashboard-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-destructive">
            Failed to load dashboard: {error?.message || "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  // Extract data with defaults
  const companies = data?.companies || [];
  const stores = data?.stores || [];
  const stats = data?.stats || {
    total_companies: 0,
    total_stores: 0,
    active_stores: 0,
    total_employees: 0,
  };

  return (
    <div className="space-y-6" data-testid="client-dashboard-page">
      {/* Welcome Header */}
      <div className="space-y-1">
        <h1 className="text-heading-2 font-bold text-foreground">
          Welcome back
          {data?.user?.name
            ? `, ${data.user.name}`
            : user?.name
              ? `, ${user.name}`
              : ""}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your business
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-active-stores">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Stores</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active_stores}</div>
            <p className="text-xs text-muted-foreground">
              Stores currently operational
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-total-employees">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Employees
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_employees}</div>
            <p className="text-xs text-muted-foreground">
              Across all your stores
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-companies">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_companies}</div>
            <p className="text-xs text-muted-foreground">
              Companies you manage
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-activity">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Today&apos;s Activity
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Transactions today</p>
          </CardContent>
        </Card>
      </div>

      {/* Companies Section */}
      <Card data-testid="companies-section">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Your Companies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No companies found. Contact your administrator to set up your
              companies.
            </p>
          ) : (
            <div className="space-y-4">
              {companies.map((company) => (
                <CompanyCard key={company.company_id} company={company} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stores Section */}
      <Card data-testid="stores-section">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Your Stores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stores found. Stores will appear here once they are created
              under your companies.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <StoreCard key={store.store_id} store={store} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
