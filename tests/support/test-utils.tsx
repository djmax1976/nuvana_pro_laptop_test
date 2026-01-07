import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CashierSessionProvider } from "@/contexts/CashierSessionContext";
import { StoreProvider, StoreContextValue } from "@/contexts/StoreContext";

/**
 * Default store context value for tests
 * FE-005: UI_SECURITY - No sensitive data, only business identifiers
 */
const defaultStoreContextValue: StoreContextValue = {
  storeId: "test-store-123",
  timezone: "America/New_York",
  storeName: "Test Store",
  companyId: "test-company-456",
  clientId: "test-client-789",
};

/**
 * Test utility for rendering components with required providers
 * Creates a fresh QueryClient per test to prevent state bleed
 *
 * @param ui - React element to render
 * @param options - Optional configuration for providers
 * @param options.queryClient - Custom QueryClient instance
 * @param options.storeContext - Custom StoreContext value (overrides default timezone)
 *
 * Enterprise Standards:
 * - SEC-014: INPUT_VALIDATION - Test data uses valid UUIDs
 * - FE-005: UI_SECURITY - No sensitive data in test fixtures
 */
export function renderWithProviders(
  ui: ReactElement,
  options: {
    queryClient?: QueryClient;
    storeContext?: Partial<StoreContextValue>;
  } = {},
) {
  const {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
    storeContext = {},
  } = options;

  const storeValue: StoreContextValue = {
    ...defaultStoreContextValue,
    ...storeContext,
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        <StoreProvider value={storeValue}>
          <CashierSessionProvider>{children}</CashierSessionProvider>
        </StoreProvider>
      </QueryClientProvider>
    );
  };

  return render(ui, { wrapper: Wrapper, ...options } as RenderOptions);
}

// Re-export everything from React Testing Library
export * from "@testing-library/react";
