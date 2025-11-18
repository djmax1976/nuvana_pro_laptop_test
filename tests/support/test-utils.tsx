import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Test utility for rendering components with required providers
 * Creates a fresh QueryClient per test to prevent state bleed
 */
export function renderWithProviders(
  ui: ReactElement,
  options: {
    queryClient?: QueryClient;
  } = {},
) {
  const {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
  } = options;

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  return render(ui, { wrapper: Wrapper, ...options } as RenderOptions);
}

// Re-export everything from React Testing Library
export * from "@testing-library/react";
