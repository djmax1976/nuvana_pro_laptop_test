"use client";

import { useState, useCallback } from "react";
import { useForm, FormProvider } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
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

/**
 * Validate IANA timezone format (safer implementation to avoid ReDoS)
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
      (val) => validateIANATimezoneFormat(val),
      "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    ),
  address: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"], {
    message: "Please select a status",
  }),
});

/**
 * Password regex matching backend validation
 * Requires: 8+ chars, uppercase, lowercase, number, special char (@$!%*?&)
 */
const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

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
      "Password must include uppercase, lowercase, number, and special character (@$!%*?&)",
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
 * Step 1: Store information (name, timezone, address, status)
 * Step 2: Store login credentials and terminal configuration
 */
export function CreateStoreWizard({
  companyId,
  onSuccess,
}: CreateStoreWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const [vendorType, setVendorType] =
    useState<TerminalWithStatus["vendor_type"]>("GENERIC");
  const [connectionConfig, setConnectionConfig] =
    useState<TerminalWithStatus["connection_config"]>(null);

  const createStoreMutation = useCreateStoreWithLogin();

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      name: "",
      timezone: "America/New_York",
      address: "",
      status: "ACTIVE",
      login_email: "",
      login_password: "",
    },
    mode: "onChange",
  });

  // Validate step 1 fields
  const validateStep1 = useCallback(async () => {
    const result = await form.trigger([
      "name",
      "timezone",
      "address",
      "status",
    ]);
    return result;
  }, [form]);

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
    setVendorType("GENERIC");
    setConnectionConfig(null);
    setIsTerminalDialogOpen(true);
  };

  const openEditTerminalDialog = (terminal: LocalTerminal) => {
    setEditingTerminal(terminal);
    setTerminalName(terminal.name);
    setTerminalDeviceId(terminal.device_id || "");
    setConnectionType(terminal.connection_type || "MANUAL");
    setVendorType(terminal.vendor_type || "GENERIC");
    setConnectionConfig(terminal.connection_config || null);
    setIsTerminalDialogOpen(true);
  };

  const closeTerminalDialog = () => {
    setIsTerminalDialogOpen(false);
    setEditingTerminal(null);
    setTerminalName("");
    setTerminalDeviceId("");
    setConnectionType("MANUAL");
    setVendorType("GENERIC");
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
      vendor_type: vendorType,
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
          ...(values.address
            ? { location_json: { address: values.address } }
            : {}),
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
                        <Input
                          placeholder="America/New_York"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="timezone-input"
                        />
                      </FormControl>
                      <FormDescription>
                        IANA timezone format (e.g., America/New_York,
                        Europe/London, UTC)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter store address"
                          {...field}
                          value={field.value ?? ""}
                          disabled={isSubmitting}
                          rows={3}
                          data-testid="address-input"
                        />
                      </FormControl>
                      <FormDescription>
                        Physical address of the store (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          number, and special character (@$!%*?&)
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
              <label htmlFor="connection-type" className="text-sm font-medium">
                Connection Type
              </label>
              <Select
                value={connectionType || "MANUAL"}
                onValueChange={(value) =>
                  setConnectionType(
                    value as TerminalWithStatus["connection_type"],
                  )
                }
              >
                <SelectTrigger className="mt-1" id="connection-type">
                  <SelectValue placeholder="Select connection type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NETWORK">Network</SelectItem>
                  <SelectItem value="API">API</SelectItem>
                  <SelectItem value="WEBHOOK">Webhook</SelectItem>
                  <SelectItem value="FILE">File</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="vendor-type" className="text-sm font-medium">
                POS Vendor
              </label>
              <Select
                value={vendorType || "GENERIC"}
                onValueChange={(value) =>
                  setVendorType(value as TerminalWithStatus["vendor_type"])
                }
              >
                <SelectTrigger className="mt-1" id="vendor-type">
                  <SelectValue placeholder="Select POS vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERIC">Generic</SelectItem>
                  <SelectItem value="SQUARE">Square</SelectItem>
                  <SelectItem value="CLOVER">Clover</SelectItem>
                  <SelectItem value="TOAST">Toast</SelectItem>
                  <SelectItem value="LIGHTSPEED">Lightspeed</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
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
