"use client";

import { cn } from "@/lib/utils";
import { OwnedStore } from "@/lib/api/client-dashboard";

interface StoreTabsProps {
  stores: OwnedStore[];
  selectedStoreId: string | null;
  onStoreSelect: (storeId: string) => void;
}

/**
 * StoreTabs component
 * Displays tabs for all accessible stores and handles tab switching
 *
 * @requirements
 * - AC #1: Display tabs for all stores the client has access to
 * - AC #1: Implement tab switching functionality
 * - AC #1: Use shadcn/ui Tabs component for consistent styling (or button-based tabs)
 */
export function StoreTabs({
  stores,
  selectedStoreId,
  onStoreSelect,
}: StoreTabsProps) {
  if (stores.length === 0) {
    return null;
  }

  // Single store - no need for tabs
  if (stores.length === 1) {
    return (
      <div className="border-b" data-testid="store-tabs">
        <div className="px-4 py-2 text-sm font-medium text-foreground">
          {stores[0].name}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b" data-testid="store-tabs">
      <nav
        className="flex space-x-1 overflow-x-auto"
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
                  onStoreSelect(stores[nextIndex].store_id);
                }
              }}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors",
                "border-b-2 border-transparent",
                "hover:text-foreground hover:border-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                "min-w-fit whitespace-nowrap",
                isActive
                  ? "text-foreground border-primary"
                  : "text-muted-foreground",
              )}
              data-testid={`store-tab-${store.store_id}`}
              aria-selected={isActive}
              aria-controls={`lottery-table-${store.store_id}`}
              role="tab"
              tabIndex={isActive ? 0 : -1}
            >
              {store.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
