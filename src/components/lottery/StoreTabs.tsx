"use client";

import { cn } from "@/lib/utils";
import { OwnedStore } from "@/lib/api/client-dashboard";
import { Store } from "lucide-react";

interface StoreTabsProps {
  stores: OwnedStore[];
  selectedStoreId: string | null;
  onStoreSelect: (storeId: string) => void;
}

/**
 * StoreTabs component
 * Displays modern pill-style tabs for all accessible stores
 *
 * @requirements
 * - AC #1: Display tabs for all stores the client has access to
 * - AC #1: Implement tab switching functionality
 * - AC #1: Modern pill-style design with smooth transitions
 */
export function StoreTabs({
  stores,
  selectedStoreId,
  onStoreSelect,
}: StoreTabsProps) {
  if (stores.length === 0) {
    return null;
  }

  // Single store - show as highlighted badge
  if (stores.length === 1) {
    return (
      <div className="pb-2" data-testid="store-tabs">
        <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-lg border border-primary/20">
          <Store className="h-4 w-4" />
          <span className="text-sm font-semibold">{stores[0].name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-2" data-testid="store-tabs">
      <nav
        className="inline-flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50 overflow-x-auto"
        aria-label="Store tabs"
        role="tablist"
      >
        {stores.map((store) => {
          const isActive = store.store_id === selectedStoreId;
          return (
            <button
              key={store.store_id}
              onClick={() => onStoreSelect(store.store_id)}
              onKeyDown={(e) => {
                // Handle arrow key navigation
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  const currentIndex = stores.findIndex(
                    (s) => s.store_id === store.store_id,
                  );
                  const nextIndex =
                    e.key === "ArrowRight"
                      ? (currentIndex + 1) % stores.length
                      : (currentIndex - 1 + stores.length) % stores.length;
                  // eslint-disable-next-line security/detect-object-injection
                  const nextStore = stores[nextIndex];
                  onStoreSelect(nextStore.store_id);
                  // Move focus to the next tab button
                  const nextButton = document.querySelector(
                    `[data-testid="store-tab-${nextStore.store_id}"]`,
                  ) as HTMLButtonElement;
                  nextButton?.focus();
                }
              }}
              className={cn(
                "relative inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg",
                "transition-all duration-200 ease-in-out",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                "min-w-fit whitespace-nowrap",
                isActive
                  ? "bg-background text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
              data-testid={`store-tab-${store.store_id}`}
              aria-selected={isActive}
              aria-controls={`lottery-table-${store.store_id}`}
              role="tab"
              tabIndex={isActive ? 0 : -1}
            >
              <Store
                className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              />
              {store.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
