/**
 * ConnectionConfigForm Component Tests
 *
 * Story: Store-level POS Connection Configuration
 *
 * @test-level COMPONENT
 * @justification Component-level tests for ConnectionConfigForm UI and validation
 * @feature Store POS Configuration UI
 * @created 2026-01-25
 * @priority P0 (Critical)
 *
 * BUSINESS RULES TESTED:
 * - BR-FORM-001: MANUAL connection type renders no config form
 * - BR-FORM-002: NETWORK connection shows host, port, protocol fields
 * - BR-FORM-003: API connection shows base_url, api_key fields
 * - BR-FORM-004: WEBHOOK connection shows webhook_url (readonly), secret fields
 * - BR-FORM-005: FILE connection shows import_path field
 * - BR-FORM-006: Form uses snake_case keys (import_path, not importPath)
 * - BR-FORM-007: Port validation rejects non-positive integers
 * - BR-FORM-008: URL validation for base_url field
 *
 * SECURITY FOCUS:
 * - Config keys use snake_case to match desktop app schema
 * - Sensitive fields (api_key, secret) use password input type
 *
 * TEST PHILOSOPHY:
 * - Tests represent ground truth - code must conform to tests
 * - Snake_case keys are CRITICAL - this was the root cause of the bug
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  fireEvent,
} from "../support/test-utils";
import userEvent from "@testing-library/user-event";
import { ConnectionConfigForm } from "@/components/stores/ConnectionConfigForm";

describe("2.4-COMPONENT: ConnectionConfigForm Component", () => {
  /**
   * BR-FORM-001: MANUAL connection type renders no config form
   */
  describe("MANUAL Connection Type", () => {
    it("[P0-BR-FORM-001] should render nothing for MANUAL connection type", () => {
      const onConfigChange = vi.fn();
      const { container } = renderWithProviders(
        <ConnectionConfigForm
          connectionType="MANUAL"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      // THEN: No form fields should be rendered
      expect(container.querySelector("input")).toBeNull();
      expect(container.querySelector("select")).toBeNull();
    });

    it("[P1-BR-FORM-001] should call onConfigChange with null for MANUAL", async () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="MANUAL"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      // THEN: onConfigChange should be called with null
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalledWith(null);
      });
    });

    it("[P1] should render nothing for undefined connection type", () => {
      const onConfigChange = vi.fn();
      const { container } = renderWithProviders(
        <ConnectionConfigForm
          connectionType={undefined as any}
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      expect(container.querySelector("input")).toBeNull();
    });
  });

  /**
   * BR-FORM-002: NETWORK connection shows host, port, protocol fields
   */
  describe("NETWORK Connection Type", () => {
    it("[P0-BR-FORM-002] should render host, port, protocol fields for NETWORK", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="NETWORK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Port/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Protocol/i)).toBeInTheDocument();
    });

    it("[P0-BR-FORM-006] should use snake_case keys for NETWORK config", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="NETWORK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      // Enter host value and blur to trigger config update
      const hostInput = screen.getByLabelText(/Host/i);
      await user.type(hostInput, "192.168.1.100");
      fireEvent.blur(hostInput);

      // THEN: onConfigChange should be called with snake_case key "host"
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({ host: "192.168.1.100" }),
        );
      });
    });

    it("[P0-BR-FORM-007] should show validation error for negative port", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="NETWORK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const portInput = screen.getByLabelText(/Port/i);
      await user.type(portInput, "-1");
      fireEvent.blur(portInput);

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(
          screen.getByText(/port must be a positive integer/i),
        ).toBeInTheDocument();
      });
    });

    it("[P0-BR-FORM-007] should show validation error for zero port", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="NETWORK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const portInput = screen.getByLabelText(/Port/i);
      await user.type(portInput, "0");
      fireEvent.blur(portInput);

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(
          screen.getByText(/port must be a positive integer/i),
        ).toBeInTheDocument();
      });
    });

    it("[P1] should clear port validation error for valid port", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="NETWORK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const portInput = screen.getByLabelText(/Port/i);

      // Enter invalid port first
      await user.type(portInput, "-1");
      fireEvent.blur(portInput);

      // Verify error appears
      await waitFor(() => {
        expect(
          screen.getByText(/port must be a positive integer/i),
        ).toBeInTheDocument();
      });

      // Clear and enter valid port
      await user.clear(portInput);
      await user.type(portInput, "8080");
      fireEvent.blur(portInput);

      // THEN: Validation error should be cleared
      await waitFor(() => {
        expect(
          screen.queryByText(/port must be a positive integer/i),
        ).not.toBeInTheDocument();
      });
    });

    it("[P1] should pre-populate NETWORK fields from existing config", () => {
      const onConfigChange = vi.fn();
      const existingConfig = {
        host: "192.168.1.50",
        port: 9999,
        protocol: "HTTP",
      };

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="NETWORK"
          connectionConfig={existingConfig}
          onConfigChange={onConfigChange}
        />,
      );

      const hostInput = screen.getByLabelText(/Host/i) as HTMLInputElement;
      const portInput = screen.getByLabelText(/Port/i) as HTMLInputElement;

      expect(hostInput.value).toBe("192.168.1.50");
      expect(portInput.value).toBe("9999");
    });
  });

  /**
   * BR-FORM-003: API connection shows base_url, api_key fields
   */
  describe("API Connection Type", () => {
    it("[P0-BR-FORM-003] should render base_url, api_key fields for API", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="API"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    });

    it("[P0-BR-FORM-006] should use snake_case keys for API config (base_url, api_key)", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="API"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      // Enter base_url value
      const urlInput = screen.getByLabelText(/Base URL/i);
      await user.type(urlInput, "https://api.example.com");
      fireEvent.blur(urlInput);

      // THEN: onConfigChange should be called with snake_case key "base_url"
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({ base_url: "https://api.example.com" }),
        );
      });
    });

    it("[P0-BR-FORM-008] should show validation error for invalid URL", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="API"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const urlInput = screen.getByLabelText(/Base URL/i);
      await user.type(urlInput, "not-a-valid-url");
      fireEvent.blur(urlInput);

      // THEN: Validation error should be displayed
      await waitFor(() => {
        expect(
          screen.getByText(/base_url must be a valid URL/i),
        ).toBeInTheDocument();
      });
    });

    it("[P1] should use password input type for api_key field", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="API"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const apiKeyInput = screen.getByLabelText(/API Key/i) as HTMLInputElement;
      expect(apiKeyInput.type).toBe("password");
    });

    it("[P1] should pre-populate API fields from existing config with snake_case keys", () => {
      const onConfigChange = vi.fn();
      const existingConfig = {
        base_url: "https://connect.squareup.com",
        api_key: "EAAAL...",
      };

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="API"
          connectionConfig={existingConfig}
          onConfigChange={onConfigChange}
        />,
      );

      const urlInput = screen.getByLabelText(/Base URL/i) as HTMLInputElement;
      const apiKeyInput = screen.getByLabelText(/API Key/i) as HTMLInputElement;

      expect(urlInput.value).toBe("https://connect.squareup.com");
      expect(apiKeyInput.value).toBe("EAAAL...");
    });
  });

  /**
   * BR-FORM-004: WEBHOOK connection shows webhook_url, secret fields
   */
  describe("WEBHOOK Connection Type", () => {
    it("[P0-BR-FORM-004] should render webhook URL (readonly) and secret fields for WEBHOOK", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="WEBHOOK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      expect(screen.getByLabelText(/Webhook URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Secret/i)).toBeInTheDocument();
    });

    it("[P1] should have readonly webhook URL field", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="WEBHOOK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const webhookUrlInput = screen.getByLabelText(
        /Webhook URL/i,
      ) as HTMLInputElement;
      expect(webhookUrlInput.readOnly).toBe(true);
    });

    it("[P1] should use password input type for secret field", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="WEBHOOK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const secretInput = screen.getByLabelText(/Secret/i) as HTMLInputElement;
      expect(secretInput.type).toBe("password");
    });

    it("[P1] should generate webhook URL when storeId and terminalId provided", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="WEBHOOK"
          connectionConfig={null}
          onConfigChange={onConfigChange}
          storeId="store-123"
          terminalId="terminal-456"
        />,
      );

      const webhookUrlInput = screen.getByLabelText(
        /Webhook URL/i,
      ) as HTMLInputElement;
      expect(webhookUrlInput.value).toContain(
        "/api/webhooks/stores/store-123/terminals/terminal-456",
      );
    });
  });

  /**
   * BR-FORM-005: FILE connection shows import_path field
   */
  describe("FILE Connection Type", () => {
    it("[P0-BR-FORM-005] should render import_path field for FILE", () => {
      const onConfigChange = vi.fn();
      renderWithProviders(
        <ConnectionConfigForm
          connectionType="FILE"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      expect(screen.getByLabelText(/Import Path/i)).toBeInTheDocument();
    });

    it("[P0-BR-FORM-006] should use snake_case key 'import_path' for FILE config", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="FILE"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      // Enter import_path value
      const pathInput = screen.getByLabelText(/Import Path/i);
      await user.type(pathInput, "c:\\XMLGateway");
      fireEvent.blur(pathInput);

      // THEN: onConfigChange should be called with snake_case key "import_path"
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({ import_path: "c:\\XMLGateway" }),
        );
      });
    });

    it("[P0] should NOT use camelCase key 'importPath' for FILE config", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="FILE"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      // Enter import_path value
      const pathInput = screen.getByLabelText(/Import Path/i);
      await user.type(pathInput, "c:\\XMLGateway");
      fireEvent.blur(pathInput);

      // THEN: onConfigChange should NOT use camelCase key "importPath"
      await waitFor(() => {
        const lastCall =
          onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1][0];
        expect(lastCall).not.toHaveProperty("importPath");
        expect(lastCall).toHaveProperty("import_path");
      });
    });

    it("[P1] should pre-populate FILE field from existing config with snake_case key", () => {
      const onConfigChange = vi.fn();
      const existingConfig = {
        import_path: "c:\\XMLGateway_new",
      };

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="FILE"
          connectionConfig={existingConfig}
          onConfigChange={onConfigChange}
        />,
      );

      const pathInput = screen.getByLabelText(
        /Import Path/i,
      ) as HTMLInputElement;
      expect(pathInput.value).toBe("c:\\XMLGateway_new");
    });

    it("[P1] should handle Windows paths with backslashes", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="FILE"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      // Enter Windows path with backslashes
      const pathInput = screen.getByLabelText(/Import Path/i);
      fireEvent.change(pathInput, {
        target: { value: "c:\\XMLGateway\\subdir" },
      });
      fireEvent.blur(pathInput);

      // THEN: Path should be preserved with backslashes
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalledWith(
          expect.objectContaining({ import_path: "c:\\XMLGateway\\subdir" }),
        );
      });
    });
  });

  /**
   * Snake_case Keys - Critical Bug Prevention Tests
   * These tests exist specifically to prevent regression of the camelCase/snake_case bug
   */
  describe("Snake_case Keys - Critical Bug Prevention", () => {
    it("[P0-CRITICAL] should NEVER use camelCase 'importPath' - use 'import_path' instead", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="FILE"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const pathInput = screen.getByLabelText(/Import Path/i);
      await user.type(pathInput, "test");
      fireEvent.blur(pathInput);

      // Verify ALL calls use snake_case
      await waitFor(() => {
        onConfigChange.mock.calls.forEach((call) => {
          const config = call[0];
          if (config !== null) {
            expect(config).not.toHaveProperty("importPath");
          }
        });
      });
    });

    it("[P0-CRITICAL] should NEVER use camelCase 'baseUrl' - use 'base_url' instead", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="API"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const urlInput = screen.getByLabelText(/Base URL/i);
      await user.type(urlInput, "https://test.com");
      fireEvent.blur(urlInput);

      // Verify ALL calls use snake_case
      await waitFor(() => {
        onConfigChange.mock.calls.forEach((call) => {
          const config = call[0];
          if (config !== null) {
            expect(config).not.toHaveProperty("baseUrl");
          }
        });
      });
    });

    it("[P0-CRITICAL] should NEVER use camelCase 'apiKey' - use 'api_key' instead", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="API"
          connectionConfig={null}
          onConfigChange={onConfigChange}
        />,
      );

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      await user.type(apiKeyInput, "test-key");
      fireEvent.blur(apiKeyInput);

      // Verify ALL calls use snake_case
      await waitFor(() => {
        onConfigChange.mock.calls.forEach((call) => {
          const config = call[0];
          if (config !== null) {
            expect(config).not.toHaveProperty("apiKey");
          }
        });
      });
    });

    it("[P0-CRITICAL] should NEVER use camelCase 'webhookUrl' - use 'webhook_url' instead", async () => {
      const onConfigChange = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <ConnectionConfigForm
          connectionType="WEBHOOK"
          connectionConfig={{ webhook_url: "https://test.com", secret: "s" }}
          onConfigChange={onConfigChange}
        />,
      );

      const secretInput = screen.getByLabelText(/Secret/i);
      await user.type(secretInput, "test-secret");
      fireEvent.blur(secretInput);

      // Verify ALL calls use snake_case
      await waitFor(() => {
        onConfigChange.mock.calls.forEach((call) => {
          const config = call[0];
          if (config !== null) {
            expect(config).not.toHaveProperty("webhookUrl");
          }
        });
      });
    });
  });
});
