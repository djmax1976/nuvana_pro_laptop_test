"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateStoreWithLogin,
  type TerminalInput,
  type TerminalWithStatus,
} from "@/lib/api/stores";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { ConnectionConfigForm } from "@/components/stores/ConnectionConfigForm";
import { AddressFields, type AddressFieldsValue } from "@/components/address";
import { POSTypeSelector } from "@/components/pos-integration/POSTypeSelector";
import type { POSSystemType } from "@/types/pos-integration";
import { getConnectionTypeForPOS } from "@/lib/pos-integration/pos-types";
import {
  TimezoneSelector,
  isValidUSTimezone,
  DEFAULT_TIMEZONE,
} from "@/components/stores/TimezoneSelector";

/**
 * Validate IANA timezone format (safer implementation to avoid ReDoS)
 * @deprecated Use isValidUSTimezone from TimezoneSelector instead
 */
function validateIANATimezoneFormat(timezone: string): boolean {
  if (timezone === "UTC") {
    return true;
  }
  if (/^GMT[+-]\d{1,2}$/.test(timezone)) {
    return true;
  }
  // Limit length to prevent ReDoS
  if (timezone.length > 50) {
    return false;
  }
  // Split and validate each segment instead of using nested quantifiers
  const parts = timezone.split("/");
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }
  // Each part should contain only letters and underscores
  const segmentPattern = /^[A-Za-z_]+$/;
  return parts.every((part) => segmentPattern.test(part));
}

/**
 * Step 1: Store Information schema
 * Note: Structured address validation is handled separately via AddressFields component
 */
const storeInfoSchema = z.object({
  name: z
    .string()
    .min(1, "Store name is required")
    .max(255, "Store name must be 255 characters or less"),
  timezone: z
    .string()
    .min(1, "Timezone is required")
    .refine(
      (val) => isValidUSTimezone(val),
      "Please select a valid US timezone",
    ),
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"], {
    message: "Please select a status",
  }),
});

/**
 * Password regex matching backend validation
 * Requires: 8+ chars, uppercase, lowercase, number, special char (!@#$%^&*(),.?":{}|<>)
 */
const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[\w!@#$%^&*(),.?":{}|<>]{8,}$/;

/**
 * Step 2: Store Login and Terminals schema
 */
const loginTerminalsSchema = z.object({
  login_email: z
    .string()
    .email("Invalid email address")
    .min(1, "Store login email is required"),
  login_password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      passwordRegex,
      "Password must include uppercase, lowercase, number, and special character (!@#$%^&* etc.)",
    ),
});

/**
 * Combined wizard schema
 */
const wizardSchema = storeInfoSchema.merge(loginTerminalsSchema);

type WizardFormValues = z.infer<typeof wizardSchema>;

/**
 * Local terminal state for the wizard
 */
interface LocalTerminal extends TerminalInput {
  id: string; // Temporary ID for list key
}

interface CreateStoreWizardProps {
  companyId: string;
  onSuccess?: () => void;
}

/**
 * CreateStoreWizard component
 * Two-step wizard for creating a store with login and terminals
 * Step 1: Store information (name, timezone, structured address, status)
 * Step 2: Store login credentials and terminal configuration
 *
 * @enterprise-standards
 * - FE-002: FORM_VALIDATION - Client-side validation mirrors backend
 * - SEC-014: INPUT_VALIDATION - Strict validation for all address fields
 */
export function CreateStoreWizard({
  companyId,
  onSuccess,
}: CreateStoreWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Structured address state management
  const [storeAddress, setStoreAddress] = useState<Partial<AddressFieldsValue>>(
    {},
  );

  // Address validation errors state
  const [addressErrors, setAddressErrors] = useState<
    Partial<Record<keyof AddressFieldsValue, string>>
  >({});

  // === Store-level POS Configuration ===
  // Enterprise-grade POS config at Store level (not Terminal)
  const [storePosType, setStorePosType] =
    useState<POSSystemType>("MANUAL_ENTRY");
  const [storeConnectionType, setStoreConnectionType] = useState<
    "NETWORK" | "API" | "WEBHOOK" | "FILE" | "MANUAL"
  >("MANUAL");
  const [storeConnectionConfig, setStoreConnectionConfig] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Terminal management state
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [isTerminalDialogOpen, setIsTerminalDialogOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<LocalTerminal | null>(
    null,
  );
  const [terminalName, setTerminalName] = useState("");
  const [terminalDeviceId, setTerminalDeviceId] = useState("");
  const [connectionType, setConnectionType] =
    useState<TerminalWithStatus["connection_type"]>("MANUAL");
  // Enterprise-grade POS type using POSSystemType (15 types)
  const [posType, setPosType] = useState<POSSystemType>("MANUAL_ENTRY");
  const [connectionConfig, setConnectionConfig] =
    useState<TerminalWithStatus["connection_config"]>(null);

  const createStoreMutation = useCreateStoreWithLogin();

  /**
   * Handle Store-level POS type selection
   * Auto-sets connection type based on POS configuration
   */
  const handleStorePosTypeChange = (newPosType: POSSystemType) => {
    setStorePosType(newPosType);
    const autoConnectionType = getConnectionTypeForPOS(newPosType);
    setStoreConnectionType(autoConnectionType);
    if (autoConnectionType === "MANUAL") {
      setStoreConnectionConfig(null);
    }
  };

  /**
   * Handle Terminal-level POS type selection - auto-sets connection type based on POS configuration
   */
  const handlePosTypeChange = (newPosType: POSSystemType) => {
    setPosType(newPosType);
    const autoConnectionType = getConnectionTypeForPOS(newPosType);
    setConnectionType(autoConnectionType);
    if (autoConnectionType === "MANUAL") {
      setConnectionConfig(null);
    }
  };

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      name: "",
      timezone: DEFAULT_TIMEZONE,
      status: "ACTIVE",
      login_email: "",
      login_password: "",
    },
    mode: "onChange",
  });

  /**
   * Handle address field changes from AddressFields component
   */
  const handleAddressChange = useCallback(
    (newAddress: Partial<AddressFieldsValue>) => {
      setStoreAddress(newAddress);
      // Clear errors for fields that now have values
      setAddressErrors((prev) => {
        const updated = { ...prev };
        if (newAddress.address_line1) delete updated.address_line1;
        if (newAddress.state_id) delete updated.state_id;
        if (newAddress.city) delete updated.city;
        if (newAddress.zip_code) delete updated.zip_code;
        return updated;
      });
    },
    [],
  );

  /**
   * Validate structured address fields
   * @enterprise-standards SEC-014: INPUT_VALIDATION
   */
  const validateAddress = useCallback((): boolean => {
    const errors: Partial<Record<keyof AddressFieldsValue, string>> = {};
    let isValid = true;

    // Address line 1 is required
    if (
      !storeAddress.address_line1 ||
      storeAddress.address_line1.trim().length === 0
    ) {
      errors.address_line1 = "Street address is required";
      isValid = false;
    } else if (storeAddress.address_line1.length > 255) {
      errors.address_line1 = "Street address cannot exceed 255 characters";
      isValid = false;
    }

    // State is required (determines lottery game visibility)
    if (!storeAddress.state_id) {
      errors.state_id = "State is required";
      isValid = false;
    }

    // City is required
    if (!storeAddress.city || storeAddress.city.trim().length === 0) {
      errors.city = "City is required";
      isValid = false;
    } else if (storeAddress.city.length > 100) {
      errors.city = "City cannot exceed 100 characters";
      isValid = false;
    }

    // ZIP code is required with format validation
    if (!storeAddress.zip_code || storeAddress.zip_code.trim().length === 0) {
      errors.zip_code = "ZIP code is required";
      isValid = false;
    } else {
      // eslint-disable-next-line security/detect-unsafe-regex
      const zipRegex = /^[0-9]{5}(-[0-9]{4})?$/;
      if (!zipRegex.test(storeAddress.zip_code)) {
        errors.zip_code = "ZIP code must be in format 12345 or 12345-6789";
        isValid = false;
      }
    }

    setAddressErrors(errors);
    return isValid;
  }, [storeAddress]);

  // Validate step 1 fields including structured address
  const validateStep1 = useCallback(async () => {
    const formResult = await form.trigger(["name", "timezone", "status"]);
    const addressValid = validateAddress();
    return formResult && addressValid;
  }, [form, validateAddress]);

  // Handle next step
  const handleNextStep = async () => {
    if (currentStep === 1) {
      const isValid = await validateStep1();
      if (isValid) {
        setCurrentStep(2);
      }
    }
  };

  // Handle previous step
  const handlePreviousStep = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    }
  };

  // Generate temporary ID for terminals using crypto API for uniqueness
  const generateTempId = () => `temp-${crypto.randomUUID()}`;

  // Terminal dialog handlers
  const openAddTerminalDialog = () => {
    setEditingTerminal(null);
    setTerminalName("");
    setTerminalDeviceId("");
    setConnectionType("MANUAL");
    setPosType("MANUAL_ENTRY");
    setConnectionConfig(null);
    setIsTerminalDialogOpen(true);
  };

  const openEditTerminalDialog = (terminal: LocalTerminal) => {
    setEditingTerminal(terminal);
    setTerminalName(terminal.name);
    setTerminalDeviceId(terminal.device_id || "");
    setConnectionType(terminal.connection_type || "MANUAL");
    setPosType(terminal.pos_type || "MANUAL_ENTRY");
    setConnectionConfig(terminal.connection_config || null);
    setIsTerminalDialogOpen(true);
  };

  const closeTerminalDialog = () => {
    setIsTerminalDialogOpen(false);
    setEditingTerminal(null);
    setTerminalName("");
    setTerminalDeviceId("");
    setConnectionType("MANUAL");
    setPosType("MANUAL_ENTRY");
    setConnectionConfig(null);
  };

  const handleSaveTerminal = () => {
    if (!terminalName.trim()) {
      toast({
        title: "Error",
        description: "Terminal name is required",
        variant: "destructive",
      });
      return;
    }

    const terminalData: LocalTerminal = {
      id: editingTerminal?.id || generateTempId(),
      name: terminalName.trim(),
      device_id: terminalDeviceId.trim() || undefined,
      connection_type: connectionType,
      pos_type: posType,
      connection_config:
        connectionType && connectionType !== "MANUAL"
          ? (connectionConfig as Record<string, unknown>)
          : undefined,
    };

    if (editingTerminal) {
      // Update existing terminal
      setTerminals((prev) =>
        prev.map((t) => (t.id === editingTerminal.id ? terminalData : t)),
      );
    } else {
      // Add new terminal
      setTerminals((prev) => [...prev, terminalData]);
    }

    closeTerminalDialog();
  };

  const handleDeleteTerminal = (terminalId: string) => {
    setTerminals((prev) => prev.filter((t) => t.id !== terminalId));
  };

  // Format connection type for display
  const formatConnectionType = (type?: string): string => {
    if (!type) return "Manual";
    switch (type) {
      case "NETWORK":
        return "Network";
      case "API":
        return "API";
      case "WEBHOOK":
        return "Webhook";
      case "FILE":
        return "File";
      case "MANUAL":
        return "Manual";
      default:
        return "Manual";
    }
  };

  // Handle form submission
  const onSubmit = async (values: WizardFormValues) => {
    setIsSubmitting(true);
    try {
      // Prepare terminals without the temporary ID
      const terminalInputs: TerminalInput[] = terminals.map(
        ({ id, ...rest }) => rest,
      );

      await createStoreMutation.mutateAsync({
        companyId,
        data: {
          name: values.name,
          timezone: values.timezone,
          status: values.status,
          // Structured address fields for enterprise-grade storage
          address_line1: storeAddress.address_line1?.trim(),
          address_line2: storeAddress.address_line2?.trim() || null,
          city: storeAddress.city?.trim(),
          state_id: storeAddress.state_id,
          county_id: storeAddress.county_id || null,
          zip_code: storeAddress.zip_code?.trim(),
          // Store-level POS configuration
          pos_type: storePosType,
          pos_connection_type: storeConnectionType,
          pos_connection_config:
            storeConnectionType !== "MANUAL" ? storeConnectionConfig : null,
          // Keep legacy location_json for backward compatibility
          location_json: {
            address: [
              storeAddress.address_line1,
              storeAddress.address_line2,
              storeAddress.city,
              storeAddress.zip_code,
            ]
              .filter(Boolean)
              .join(", "),
          },
          manager: {
            email: values.login_email,
            password: values.login_password,
          },
          terminals: terminalInputs.length > 0 ? terminalInputs : undefined,
        },
      });

      toast({
        title: "Success",
        description: "Store created successfully with login and terminals",
      });

      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/stores?companyId=${companyId}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create store. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div
        className="flex items-center justify-center space-x-4"
        data-testid="step-indicator"
      >
        <div className="flex items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
              currentStep >= 1
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground text-muted-foreground"
            }`}
          >
            {currentStep > 1 ? <Check className="h-4 w-4" /> : "1"}
          </div>
          <span className="ml-2 text-sm font-medium">Store Info</span>
        </div>
        <div className="h-0.5 w-16 bg-muted" />
        <div className="flex items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
              currentStep >= 2
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground text-muted-foreground"
            }`}
          >
            2
          </div>
          <span className="ml-2 text-sm font-medium">Login & Terminals</span>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Store Information */}
          {currentStep === 1 && (
            <Card data-testid="step-1-store-info">
              <CardHeader>
                <CardTitle>Store Information</CardTitle>
                <CardDescription>
                  Enter the basic information for your new store
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter store name"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="store-name-input"
                        />
                      </FormControl>
                      <FormDescription>
                        The name of the store (required, max 255 characters)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <FormControl>
                        <TimezoneSelector
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isSubmitting}
                          data-testid="timezone-select"
                        />
                      </FormControl>
                      <FormDescription>
                        Select the timezone for this store location
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Structured Address Fields */}
                <AddressFields
                  value={storeAddress}
                  onChange={handleAddressChange}
                  required={true}
                  disabled={isSubmitting}
                  testIdPrefix="store"
                  sectionLabel="Store Address"
                  errors={addressErrors}
                />

                {/* POS Configuration Section - Store Level */}
                <Card className="mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      POS Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <POSTypeSelector
                        id="store-pos-type"
                        label="POS System"
                        value={storePosType}
                        onChange={handleStorePosTypeChange}
                        placeholder="Select POS system..."
                        testId="store-pos-type-selector"
                        disabled={isSubmitting}
                      />
                    </div>
                    {storeConnectionType !== "MANUAL" && (
                      <ConnectionConfigForm
                        connectionType={storeConnectionType}
                        connectionConfig={storeConnectionConfig}
                        onConfigChange={setStoreConnectionConfig}
                      />
                    )}
                  </CardContent>
                </Card>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="status-select">
                            <SelectValue placeholder="Select a status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                          <SelectItem value="CLOSED">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The current status of the store
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 2: Store Login and Terminals */}
          {currentStep === 2 && (
            <div className="space-y-6" data-testid="step-2-login-terminals">
              {/* Store Login Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Store Login</CardTitle>
                  <CardDescription>
                    Create login credentials for the store dashboard. The login
                    name will be the store name.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="login_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Login Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="storelogin@example.com"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="login-email-input"
                          />
                        </FormControl>
                        <FormDescription>
                          Email address to login to the store dashboard
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="login_password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Login Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter password (min 8 characters)"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="login-password-input"
                          />
                        </FormControl>
                        <FormDescription>
                          Minimum 8 characters with uppercase, lowercase,
                          number, and special character (!@#$%^&* etc.)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Terminals Section */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>POS Terminals</CardTitle>
                      <CardDescription>
                        Add terminals for this store (optional)
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={openAddTerminalDialog}
                      disabled={isSubmitting}
                      data-testid="add-terminal-button"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Terminal
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {terminals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No terminals configured. Add a terminal to get started.
                    </p>
                  ) : (
                    <div className="space-y-2" data-testid="terminals-list">
                      {terminals.map((terminal) => (
                        <div
                          key={terminal.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                          data-testid={`terminal-item-${terminal.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {terminal.name}
                              </span>
                              {terminal.connection_type && (
                                <Badge variant="secondary">
                                  {formatConnectionType(
                                    terminal.connection_type,
                                  )}
                                </Badge>
                              )}
                            </div>
                            {terminal.device_id && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Device ID: {terminal.device_id}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditTerminalDialog(terminal)}
                              disabled={isSubmitting}
                              aria-label={`Edit ${terminal.name}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTerminal(terminal.id)}
                              disabled={isSubmitting}
                              aria-label={`Delete ${terminal.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4">
            <div>
              {currentStep === 2 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviousStep}
                  disabled={isSubmitting}
                  data-testid="back-button"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              {currentStep === 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              )}
            </div>
            <div>
              {currentStep === 1 && (
                <Button
                  type="button"
                  onClick={handleNextStep}
                  disabled={isSubmitting}
                  data-testid="next-button"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {currentStep === 2 && (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="create-store-button"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Store"
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>

      {/* Terminal Dialog */}
      <Dialog open={isTerminalDialogOpen} onOpenChange={closeTerminalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTerminal ? "Edit Terminal" : "Add Terminal"}
            </DialogTitle>
            <DialogDescription>
              {editingTerminal
                ? "Update terminal information"
                : "Create a new POS terminal for this store"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="terminal-name" className="text-sm font-medium">
                Terminal Name
              </label>
              <Input
                id="terminal-name"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="e.g., Terminal 1"
                className="mt-1"
                data-testid="terminal-name-input"
              />
            </div>
            <div>
              <label
                htmlFor="terminal-device-id"
                className="text-sm font-medium"
              >
                Device ID (Optional)
              </label>
              <Input
                id="terminal-device-id"
                value={terminalDeviceId}
                onChange={(e) => setTerminalDeviceId(e.target.value)}
                placeholder="e.g., DEV-001"
                className="mt-1"
                data-testid="terminal-device-id-input"
              />
            </div>
            <div>
              <POSTypeSelector
                id="pos-type"
                label="POS System"
                value={posType}
                onChange={handlePosTypeChange}
                placeholder="Select POS system..."
                testId="terminal-pos-type-selector"
              />
            </div>
            {connectionType && connectionType !== "MANUAL" && (
              <div className="pt-2 border-t">
                <label className="text-sm font-medium mb-2 block">
                  Connection Configuration
                </label>
                <ConnectionConfigForm
                  connectionType={connectionType}
                  connectionConfig={connectionConfig}
                  onConfigChange={setConnectionConfig}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeTerminalDialog}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveTerminal}
                data-testid="save-terminal-button"
              >
                {editingTerminal ? "Update Terminal" : "Add Terminal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
