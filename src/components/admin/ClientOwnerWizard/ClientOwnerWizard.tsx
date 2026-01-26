"use client";

/**
 * ClientOwnerWizard Component
 *
 * 5-step wizard for creating a complete client owner setup:
 * Step 1: User Info (email, name, password)
 * Step 2: Company Info (name, structured address)
 * Step 3: Store Info (name, timezone, address, POS config)
 * Step 4: Store Login (email, password)
 * Step 5: Store Manager (email, password) - Required for desktop app
 *
 * All entities are created atomically via POST /api/admin/client-owner-setup
 *
 * @enterprise-standards
 * - FE-002: FORM_VALIDATION - Client-side validation mirroring backend schemas
 * - SEC-004: XSS - All outputs escaped via React's built-in protection
 * - SEC-014: INPUT_VALIDATION - Strict validation for all inputs
 */

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
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { AddressFields, type AddressFieldsValue } from "@/components/address";
import { POSTypeSelector } from "@/components/pos-integration/POSTypeSelector";
import { ConnectionConfigForm } from "@/components/stores/ConnectionConfigForm";
import { useCreateClientOwnerSetup } from "@/lib/api/admin-users";
import type { POSSystemType } from "@/types/pos-integration";
import { getConnectionTypeForPOS } from "@/lib/pos-integration/pos-types";
import type { ClientOwnerSetupInput } from "@/types/admin-user";
import {
  TimezoneSelector,
  isValidUSTimezone,
  DEFAULT_TIMEZONE,
} from "@/components/stores/TimezoneSelector";

// =============================================================================
// Validation Constants
// =============================================================================

/**
 * ZIP code validation pattern
 * Matches 5-digit ZIP (12345) or ZIP+4 (12345-6789)
 *
 * SEC-014: INPUT_VALIDATION - Bounded quantifiers ({5}, {4}) prevent ReDoS.
 * This regex is safe: linear structure with fixed-length matches, no overlapping
 * patterns or unbounded repetition that could cause catastrophic backtracking.
 */
// eslint-disable-next-line security/detect-unsafe-regex
const ZIP_CODE_PATTERN = /^[0-9]{5}(-[0-9]{4})?$/;

/**
 * Validates ZIP code format
 * @param zipCode - The ZIP code to validate
 * @returns true if valid, false otherwise
 */
function isValidZipCode(zipCode: string): boolean {
  return ZIP_CODE_PATTERN.test(zipCode);
}

// =============================================================================
// Validation Schemas
// =============================================================================

/**
 * Base password schema with enterprise-grade requirements
 * SEC-014: INPUT_VALIDATION - Strong password requirements
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(255, "Password cannot exceed 255 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

/**
 * Step 1: User Info base schema (without refinement)
 */
const userInfoBaseSchema = z.object({
  userEmail: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters"),
  userName: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Name cannot be whitespace only",
    }),
  userPassword: passwordSchema,
  userConfirmPassword: z.string().min(1, "Please confirm your password"),
});

/**
 * Step 1: User Info schema with password confirmation refinement
 */
const userInfoSchema = userInfoBaseSchema.refine(
  (data) => data.userPassword === data.userConfirmPassword,
  {
    message: "Passwords do not match",
    path: ["userConfirmPassword"],
  },
);

/**
 * Step 2: Company Info schema
 * Note: Address is validated separately via AddressFields component
 */
const companyInfoSchema = z.object({
  companyName: z
    .string()
    .min(1, "Company name is required")
    .max(255, "Company name cannot exceed 255 characters"),
});

/**
 * Step 3: Store Info schema
 * Note: Address is validated separately via AddressFields component
 */
const storeInfoSchema = z.object({
  storeName: z
    .string()
    .min(1, "Store name is required")
    .max(255, "Store name cannot exceed 255 characters"),
  storeTimezone: z
    .string()
    .min(1, "Timezone is required")
    .refine(
      (val) => isValidUSTimezone(val),
      "Please select a valid US timezone",
    ),
  storeStatus: z.enum(["ACTIVE", "INACTIVE", "CLOSED"]),
});

/**
 * Step 4: Store Login base schema (without refinement)
 */
const storeLoginBaseSchema = z.object({
  storeLoginEmail: z
    .string()
    .min(1, "Store login email is required")
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters"),
  storeLoginPassword: passwordSchema,
  storeLoginConfirmPassword: z.string().min(1, "Please confirm your password"),
});

/**
 * Step 4: Store Login schema with password confirmation refinement
 */
const storeLoginSchema = storeLoginBaseSchema.refine(
  (data) => data.storeLoginPassword === data.storeLoginConfirmPassword,
  {
    message: "Passwords do not match",
    path: ["storeLoginConfirmPassword"],
  },
);

/**
 * Step 5: Store Manager base schema (without refinement)
 * Required for desktop app functionality
 */
const storeManagerBaseSchema = z.object({
  storeManagerEmail: z
    .string()
    .min(1, "Store manager email is required")
    .email("Invalid email format")
    .max(255, "Email cannot exceed 255 characters"),
  storeManagerPassword: passwordSchema,
  storeManagerConfirmPassword: z
    .string()
    .min(1, "Please confirm your password"),
});

/**
 * Step 5: Store Manager schema with password confirmation refinement
 */
const storeManagerSchema = storeManagerBaseSchema.refine(
  (data) => data.storeManagerPassword === data.storeManagerConfirmPassword,
  {
    message: "Passwords do not match",
    path: ["storeManagerConfirmPassword"],
  },
);

/**
 * Combined wizard schema - merges base schemas and adds cross-field refinements
 */
const wizardSchema = userInfoBaseSchema
  .merge(companyInfoSchema)
  .merge(storeInfoSchema)
  .merge(storeLoginBaseSchema)
  .merge(storeManagerBaseSchema)
  .refine((data) => data.userPassword === data.userConfirmPassword, {
    message: "Passwords do not match",
    path: ["userConfirmPassword"],
  })
  .refine(
    (data) => data.storeLoginPassword === data.storeLoginConfirmPassword,
    {
      message: "Passwords do not match",
      path: ["storeLoginConfirmPassword"],
    },
  )
  .refine(
    (data) => data.storeManagerPassword === data.storeManagerConfirmPassword,
    {
      message: "Passwords do not match",
      path: ["storeManagerConfirmPassword"],
    },
  );

type WizardFormValues = z.infer<typeof wizardSchema>;

// =============================================================================
// Component Props
// =============================================================================

interface ClientOwnerWizardProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ClientOwnerWizard({
  onSuccess,
  onCancel,
}: ClientOwnerWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password visibility toggles
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [showUserConfirmPassword, setShowUserConfirmPassword] = useState(false);
  const [showStoreLoginPassword, setShowStoreLoginPassword] = useState(false);
  const [showStoreLoginConfirmPassword, setShowStoreLoginConfirmPassword] =
    useState(false);
  const [showStoreManagerPassword, setShowStoreManagerPassword] =
    useState(false);
  const [showStoreManagerConfirmPassword, setShowStoreManagerConfirmPassword] =
    useState(false);

  // Address state (managed separately due to cascading dependencies)
  const [companyAddress, setCompanyAddress] = useState<
    Partial<AddressFieldsValue>
  >({});
  const [companyAddressErrors, setCompanyAddressErrors] = useState<
    Partial<Record<keyof AddressFieldsValue, string>>
  >({});
  const [storeAddress, setStoreAddress] = useState<Partial<AddressFieldsValue>>(
    {},
  );
  const [storeAddressErrors, setStoreAddressErrors] = useState<
    Partial<Record<keyof AddressFieldsValue, string>>
  >({});

  // POS configuration state
  const [storePosType, setStorePosType] =
    useState<POSSystemType>("MANUAL_ENTRY");
  const [storeConnectionType, setStoreConnectionType] = useState<
    "NETWORK" | "API" | "WEBHOOK" | "FILE" | "MANUAL"
  >("MANUAL");
  const [storeConnectionConfig, setStoreConnectionConfig] = useState<Record<
    string,
    unknown
  > | null>(null);

  // API mutation
  const createSetupMutation = useCreateClientOwnerSetup();

  // Form setup
  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    mode: "onChange",
    defaultValues: {
      userEmail: "",
      userName: "",
      userPassword: "",
      userConfirmPassword: "",
      companyName: "",
      storeName: "",
      storeTimezone: DEFAULT_TIMEZONE,
      storeStatus: "ACTIVE",
      storeLoginEmail: "",
      storeLoginPassword: "",
      storeLoginConfirmPassword: "",
      storeManagerEmail: "",
      storeManagerPassword: "",
      storeManagerConfirmPassword: "",
    },
  });

  // ===========================================================================
  // Address Handlers
  // ===========================================================================

  const handleCompanyAddressChange = useCallback(
    (newAddress: Partial<AddressFieldsValue>) => {
      setCompanyAddress(newAddress);
      // Clear errors for fields that now have values
      const clearedErrors = { ...companyAddressErrors };
      (Object.keys(newAddress) as Array<keyof AddressFieldsValue>).forEach(
        (key) => {
          // eslint-disable-next-line security/detect-object-injection -- key from Object.keys of typed object
          if (Object.hasOwn(newAddress, key) && newAddress[key]) {
            // eslint-disable-next-line security/detect-object-injection -- key from Object.keys of typed object
            delete clearedErrors[key];
          }
        },
      );
      setCompanyAddressErrors(clearedErrors);
    },
    [companyAddressErrors],
  );

  const handleStoreAddressChange = useCallback(
    (newAddress: Partial<AddressFieldsValue>) => {
      setStoreAddress(newAddress);
      // Clear errors for fields that now have values
      const clearedErrors = { ...storeAddressErrors };
      (Object.keys(newAddress) as Array<keyof AddressFieldsValue>).forEach(
        (key) => {
          // eslint-disable-next-line security/detect-object-injection -- key from Object.keys of typed object
          if (Object.hasOwn(newAddress, key) && newAddress[key]) {
            // eslint-disable-next-line security/detect-object-injection -- key from Object.keys of typed object
            delete clearedErrors[key];
          }
        },
      );
      setStoreAddressErrors(clearedErrors);
    },
    [storeAddressErrors],
  );

  // ===========================================================================
  // POS Configuration Handler
  // ===========================================================================

  const handleStorePosTypeChange = useCallback((posType: POSSystemType) => {
    setStorePosType(posType);
    const connectionType = getConnectionTypeForPOS(posType);
    setStoreConnectionType(connectionType);
    // Reset connection config when POS type changes
    setStoreConnectionConfig(null);
  }, []);

  // ===========================================================================
  // Validation Helpers
  // ===========================================================================

  const validateCompanyAddress = useCallback((): boolean => {
    const errors: Partial<Record<keyof AddressFieldsValue, string>> = {};

    if (!companyAddress.address_line1?.trim()) {
      errors.address_line1 = "Address line 1 is required";
    }
    if (!companyAddress.city?.trim()) {
      errors.city = "City is required";
    }
    if (!companyAddress.state_id) {
      errors.state_id = "State is required";
    }
    if (!companyAddress.zip_code?.trim()) {
      errors.zip_code = "ZIP code is required";
    } else if (!isValidZipCode(companyAddress.zip_code)) {
      errors.zip_code = "ZIP code must be 5 digits or ZIP+4 format";
    }

    setCompanyAddressErrors(errors);
    return Object.keys(errors).length === 0;
  }, [companyAddress]);

  const validateStoreAddress = useCallback((): boolean => {
    const errors: Partial<Record<keyof AddressFieldsValue, string>> = {};

    if (!storeAddress.address_line1?.trim()) {
      errors.address_line1 = "Address line 1 is required";
    }
    if (!storeAddress.city?.trim()) {
      errors.city = "City is required";
    }
    if (!storeAddress.state_id) {
      errors.state_id = "State is required";
    }
    if (!storeAddress.zip_code?.trim()) {
      errors.zip_code = "ZIP code is required";
    } else if (!isValidZipCode(storeAddress.zip_code)) {
      errors.zip_code = "ZIP code must be 5 digits or ZIP+4 format";
    }

    setStoreAddressErrors(errors);
    return Object.keys(errors).length === 0;
  }, [storeAddress]);

  // ===========================================================================
  // Step Navigation
  // ===========================================================================

  const validateStep1 = useCallback(async (): Promise<boolean> => {
    const result = await form.trigger([
      "userEmail",
      "userName",
      "userPassword",
      "userConfirmPassword",
    ]);
    return result;
  }, [form]);

  const validateStep2 = useCallback(async (): Promise<boolean> => {
    const formResult = await form.trigger(["companyName"]);
    const addressResult = validateCompanyAddress();
    return formResult && addressResult;
  }, [form, validateCompanyAddress]);

  const validateStep3 = useCallback(async (): Promise<boolean> => {
    const formResult = await form.trigger([
      "storeName",
      "storeTimezone",
      "storeStatus",
    ]);
    const addressResult = validateStoreAddress();
    return formResult && addressResult;
  }, [form, validateStoreAddress]);

  const validateStep4 = useCallback(async (): Promise<boolean> => {
    const result = await form.trigger([
      "storeLoginEmail",
      "storeLoginPassword",
      "storeLoginConfirmPassword",
    ]);

    // Additional validation: store login email must be different from user email
    const userEmail = form.getValues("userEmail");
    const storeLoginEmail = form.getValues("storeLoginEmail");

    if (userEmail.toLowerCase() === storeLoginEmail.toLowerCase()) {
      form.setError("storeLoginEmail", {
        type: "manual",
        message: "Store login email must be different from user email",
      });
      return false;
    }

    return result;
  }, [form]);

  const validateStep5 = useCallback(async (): Promise<boolean> => {
    const result = await form.trigger([
      "storeManagerEmail",
      "storeManagerPassword",
      "storeManagerConfirmPassword",
    ]);

    // Additional validation: store manager email must be different from user email and store login email
    const userEmail = form.getValues("userEmail");
    const storeLoginEmail = form.getValues("storeLoginEmail");
    const storeManagerEmail = form.getValues("storeManagerEmail");

    if (userEmail.toLowerCase() === storeManagerEmail.toLowerCase()) {
      form.setError("storeManagerEmail", {
        type: "manual",
        message: "Store manager email must be different from user email",
      });
      return false;
    }

    if (storeLoginEmail.toLowerCase() === storeManagerEmail.toLowerCase()) {
      form.setError("storeManagerEmail", {
        type: "manual",
        message: "Store manager email must be different from store login email",
      });
      return false;
    }

    return result;
  }, [form]);

  const handleNext = useCallback(async () => {
    let isValid = false;

    switch (currentStep) {
      case 1:
        isValid = await validateStep1();
        break;
      case 2:
        isValid = await validateStep2();
        break;
      case 3:
        isValid = await validateStep3();
        break;
      case 4:
        isValid = await validateStep4();
        break;
      case 5:
        isValid = await validateStep5();
        break;
    }

    if (isValid && currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as 1 | 2 | 3 | 4 | 5);
    }
  }, [
    currentStep,
    validateStep1,
    validateStep2,
    validateStep3,
    validateStep4,
    validateStep5,
  ]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5);
    }
  }, [currentStep]);

  // ===========================================================================
  // Form Submission
  // ===========================================================================

  const onSubmit = async (data: WizardFormValues) => {
    // Final validation
    if (!(await validateStep5())) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Build the complete payload
      const payload: ClientOwnerSetupInput = {
        user: {
          email: data.userEmail.toLowerCase().trim(),
          name: data.userName.trim(),
          password: data.userPassword,
        },
        company: {
          name: data.companyName.trim(),
          address: {
            address_line1: companyAddress.address_line1!,
            address_line2: companyAddress.address_line2 || "",
            city: companyAddress.city!,
            state_id: companyAddress.state_id!,
            county_id: companyAddress.county_id || "",
            zip_code: companyAddress.zip_code!,
          },
        },
        store: {
          name: data.storeName.trim(),
          timezone: data.storeTimezone,
          status: data.storeStatus,
          address_line1: storeAddress.address_line1!,
          address_line2: storeAddress.address_line2 || null,
          city: storeAddress.city!,
          state_id: storeAddress.state_id!,
          county_id: storeAddress.county_id || null,
          zip_code: storeAddress.zip_code!,
          pos_config:
            storePosType !== "MANUAL_ENTRY"
              ? {
                  pos_type: storePosType,
                  pos_connection_type: storeConnectionType,
                  pos_connection_config: storeConnectionConfig,
                }
              : undefined,
        },
        storeLogin: {
          email: data.storeLoginEmail.toLowerCase().trim(),
          password: data.storeLoginPassword,
        },
        storeManager: {
          email: data.storeManagerEmail.toLowerCase().trim(),
          password: data.storeManagerPassword,
        },
      };

      await createSetupMutation.mutateAsync(payload);

      toast({
        title: "Success",
        description:
          "Client owner setup completed successfully. User, company, store, store login, and store manager have been created.",
      });

      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/admin/users");
      }
    } catch (error: unknown) {
      // Handle field-level errors from backend
      if (error && typeof error === "object" && "response" in error) {
        const response = (
          error as {
            response?: {
              data?: {
                error?: { details?: Record<string, Record<string, string>> };
              };
            };
          }
        ).response;
        const details = response?.data?.error?.details;

        if (details) {
          // Navigate to the step with the error
          if (details.user) {
            setCurrentStep(1);
            Object.entries(details.user).forEach(([field, message]) => {
              const formField =
                `user${field.charAt(0).toUpperCase()}${field.slice(1)}` as keyof WizardFormValues;
              if (formField in form.getValues()) {
                form.setError(formField, { type: "server", message });
              }
            });
          } else if (details.company) {
            setCurrentStep(2);
          } else if (details.store) {
            setCurrentStep(3);
          } else if (details.storeLogin) {
            setCurrentStep(4);
            Object.entries(details.storeLogin).forEach(([field, message]) => {
              const formField =
                `storeLogin${field.charAt(0).toUpperCase()}${field.slice(1)}` as keyof WizardFormValues;
              if (formField in form.getValues()) {
                form.setError(formField, { type: "server", message });
              }
            });
          } else if (details.storeManager) {
            setCurrentStep(5);
            Object.entries(details.storeManager).forEach(([field, message]) => {
              const formField =
                `storeManager${field.charAt(0).toUpperCase()}${field.slice(1)}` as keyof WizardFormValues;
              if (formField in form.getValues()) {
                form.setError(formField, { type: "server", message });
              }
            });
          }
        }
      }

      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create client owner setup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div
        className="flex items-center justify-center space-x-2"
        data-testid="step-indicator"
      >
        {[1, 2, 3, 4, 5].map((step, index) => (
          <div key={step} className="flex items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium ${
                currentStep > step
                  ? "border-primary bg-primary text-primary-foreground"
                  : currentStep === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground text-muted-foreground"
              }`}
            >
              {currentStep > step ? <Check className="h-4 w-4" /> : step}
            </div>
            <span className="ml-1 hidden text-xs font-medium sm:inline">
              {step === 1 && "User"}
              {step === 2 && "Company"}
              {step === 3 && "Store"}
              {step === 4 && "Login"}
              {step === 5 && "Manager"}
            </span>
            {index < 4 && <div className="mx-2 h-0.5 w-6 bg-muted sm:w-8" />}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: User Information */}
          {currentStep === 1 && (
            <Card data-testid="step-1-user-info">
              <CardHeader>
                <CardTitle>User Information</CardTitle>
                <CardDescription>
                  Enter the client owner&apos;s account details. This user will
                  own the company.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="userEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="user@example.com"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="user-email-input"
                        />
                      </FormControl>
                      <FormDescription>
                        The email address for the client owner account
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="userName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John Doe"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="user-name-input"
                        />
                      </FormControl>
                      <FormDescription>
                        The full name of the client owner
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="userPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showUserPassword ? "text" : "password"}
                            placeholder="Enter password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="user-password-input"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() =>
                              setShowUserPassword(!showUserPassword)
                            }
                          >
                            {showUserPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Min 8 chars, uppercase, lowercase, number, special char
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="userConfirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showUserConfirmPassword ? "text" : "password"}
                            placeholder="Confirm password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="user-confirm-password-input"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() =>
                              setShowUserConfirmPassword(
                                !showUserConfirmPassword,
                              )
                            }
                          >
                            {showUserConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 2: Company Information */}
          {currentStep === 2 && (
            <Card data-testid="step-2-company-info">
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>
                  Enter the company details. This company will be owned by the
                  user created in step 1.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Acme Corporation"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="company-name-input"
                        />
                      </FormControl>
                      <FormDescription>
                        The legal name of the company
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <AddressFields
                  value={companyAddress}
                  onChange={handleCompanyAddressChange}
                  required={true}
                  disabled={isSubmitting}
                  testIdPrefix="company"
                  sectionLabel="Company Address"
                  errors={companyAddressErrors}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 3: Store Information */}
          {currentStep === 3 && (
            <Card data-testid="step-3-store-info">
              <CardHeader>
                <CardTitle>Store Information</CardTitle>
                <CardDescription>
                  Enter the first store details. The store will be linked to the
                  company.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="storeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Downtown Location"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="store-name-input"
                        />
                      </FormControl>
                      <FormDescription>
                        The name of the store location
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storeTimezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <FormControl>
                        <TimezoneSelector
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isSubmitting}
                          data-testid="store-timezone-select"
                        />
                      </FormControl>
                      <FormDescription>
                        Select the timezone for this store location
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <AddressFields
                  value={storeAddress}
                  onChange={handleStoreAddressChange}
                  required={true}
                  disabled={isSubmitting}
                  testIdPrefix="store"
                  sectionLabel="Store Address"
                  errors={storeAddressErrors}
                />

                {/* POS Configuration Section */}
                <Card className="mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      POS Configuration
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Optional: Configure POS integration for this store
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <POSTypeSelector
                      id="store-pos-type"
                      label="POS System"
                      value={storePosType}
                      onChange={handleStorePosTypeChange}
                      placeholder="Select POS system..."
                      testId="store-pos-type-selector"
                      disabled={isSubmitting}
                    />
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
                  name="storeStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="store-status-select">
                            <SelectValue placeholder="Select a status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                          <SelectItem value="CLOSED">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 4: Store Login */}
          {currentStep === 4 && (
            <Card data-testid="step-4-store-login">
              <CardHeader>
                <CardTitle>Store Login</CardTitle>
                <CardDescription>
                  Create login credentials for the store dashboard. This user
                  will manage the store.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="storeLoginEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Login Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="store@example.com"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="store-login-email-input"
                        />
                      </FormControl>
                      <FormDescription>
                        Must be different from the client owner email
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storeLoginPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showStoreLoginPassword ? "text" : "password"}
                            placeholder="Enter password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="store-login-password-input"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() =>
                              setShowStoreLoginPassword(!showStoreLoginPassword)
                            }
                          >
                            {showStoreLoginPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Min 8 chars, uppercase, lowercase, number, special char
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storeLoginConfirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={
                              showStoreLoginConfirmPassword
                                ? "text"
                                : "password"
                            }
                            placeholder="Confirm password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="store-login-confirm-password-input"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() =>
                              setShowStoreLoginConfirmPassword(
                                !showStoreLoginConfirmPassword,
                              )
                            }
                          >
                            {showStoreLoginConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 5: Store Manager */}
          {currentStep === 5 && (
            <Card data-testid="step-5-store-manager">
              <CardHeader>
                <CardTitle>Store Manager</CardTitle>
                <CardDescription>
                  Create login credentials for the store manager. This user is
                  required for the desktop application to function properly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="storeManagerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Manager Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="manager@example.com"
                          {...field}
                          disabled={isSubmitting}
                          data-testid="store-manager-email-input"
                        />
                      </FormControl>
                      <FormDescription>
                        Must be different from the client owner and store login
                        emails
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storeManagerPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={
                              showStoreManagerPassword ? "text" : "password"
                            }
                            placeholder="Enter password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="store-manager-password-input"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() =>
                              setShowStoreManagerPassword(
                                !showStoreManagerPassword,
                              )
                            }
                          >
                            {showStoreManagerPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Min 8 chars, uppercase, lowercase, number, special char
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="storeManagerConfirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={
                              showStoreManagerConfirmPassword
                                ? "text"
                                : "password"
                            }
                            placeholder="Confirm password"
                            {...field}
                            disabled={isSubmitting}
                            data-testid="store-manager-confirm-password-input"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() =>
                              setShowStoreManagerConfirmPassword(
                                !showStoreManagerConfirmPassword,
                              )
                            }
                          >
                            {showStoreManagerConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <div>
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isSubmitting}
                  data-testid="back-button"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              )}
              {currentStep === 1 && onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  data-testid="cancel-button"
                >
                  Cancel
                </Button>
              )}
            </div>
            <div>
              {currentStep < 5 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={isSubmitting}
                  data-testid="next-button"
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="submit-button"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Client Owner"
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
