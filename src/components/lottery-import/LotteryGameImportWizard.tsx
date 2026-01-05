"use client";

/**
 * Lottery Game Import Wizard
 *
 * Multi-step wizard for bulk importing lottery games from CSV.
 * Implements two-phase commit pattern with preview before commit.
 *
 * Steps:
 * 1. Upload - Select CSV file and target state
 * 2. Preview - Review validation results and errors
 * 3. Confirm - Commit import or cancel
 * 4. Results - Show import summary
 *
 * @enterprise-standards
 * - FE-001: STATE_MANAGEMENT - Local state for wizard flow
 * - FE-002: FORM_VALIDATION - File validation before upload
 * - SEC-014: INPUT_VALIDATION - Server-side validation via API
 */

import { useState, useCallback } from "react";
import {
  Upload,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

import {
  validateImport,
  commitImport,
  downloadTemplateAsFile,
  type ValidationResponse,
  type ValidatedRow,
  type CommitResponse,
  type ImportOptions,
  formatPreviewSummary,
  canProceedWithImport,
} from "@/lib/api/lottery-import";
import { type USStateResponse } from "@/lib/api/geographic";

// ============================================================================
// Types
// ============================================================================

type WizardStep = "upload" | "preview" | "confirm" | "results";

interface LotteryGameImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  states: USStateResponse[];
  onImportComplete?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function LotteryGameImportWizard({
  open,
  onOpenChange,
  states,
  onImportComplete,
}: LotteryGameImportWizardProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedStateId, setSelectedStateId] = useState<string>("");
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    skipDuplicates: true,
    updateExisting: false,
  });

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Commit state
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Download template state
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Reset wizard
  const resetWizard = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setSelectedStateId("");
    setImportOptions({ skipDuplicates: true, updateExisting: false });
    setIsValidating(false);
    setValidationResult(null);
    setValidationError(null);
    setIsCommitting(false);
    setCommitResult(null);
    setCommitError(null);
  }, []);

  // Handle template download
  const handleDownloadTemplate = useCallback(async () => {
    setIsDownloadingTemplate(true);
    try {
      await downloadTemplateAsFile();
    } catch (error: any) {
      setValidationError("Failed to download template. Please try again.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  }, []);

  // Handle dialog close
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetWizard();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetWizard],
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        // Validate file type
        if (!file.name.endsWith(".csv")) {
          setValidationError("Please select a CSV file");
          return;
        }
        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          setValidationError("File size must be less than 5MB");
          return;
        }
        setSelectedFile(file);
        setValidationError(null);
      }
    },
    [],
  );

  // Handle validation
  const handleValidate = useCallback(async () => {
    if (!selectedFile || !selectedStateId) return;

    setIsValidating(true);
    setValidationError(null);

    try {
      const result = await validateImport(
        selectedFile,
        selectedStateId,
        importOptions,
      );
      setValidationResult(result);
      setStep("preview");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error?.message ||
        error.message ||
        "Failed to validate file";
      setValidationError(errorMessage);
    } finally {
      setIsValidating(false);
    }
  }, [selectedFile, selectedStateId, importOptions]);

  // Handle commit
  const handleCommit = useCallback(async () => {
    if (!validationResult?.validation_token) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      const result = await commitImport(validationResult.validation_token, {
        skip_errors: true,
        update_duplicates: importOptions.updateExisting,
      });
      setCommitResult(result);
      setStep("results");
      onImportComplete?.();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error?.message ||
        error.message ||
        "Failed to commit import";
      setCommitError(errorMessage);
    } finally {
      setIsCommitting(false);
    }
  }, [validationResult, importOptions.updateExisting, onImportComplete]);

  // Get selected state name
  const getStateName = (stateId: string) => {
    const state = states.find((s) => s.state_id === stateId);
    return state ? `${state.name} (${state.code})` : "";
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  // Get row status badge
  const getRowStatusBadge = (row: ValidatedRow) => {
    switch (row.status) {
      case "valid":
        return (
          <Badge variant="default" className="bg-green-600">
            {row.action === "update" ? "Update" : "Create"}
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "duplicate":
        return <Badge variant="secondary">Duplicate</Badge>;
      default:
        return <Badge variant="outline">{row.status}</Badge>;
    }
  };

  // Calculate progress
  const getProgress = () => {
    switch (step) {
      case "upload":
        return 25;
      case "preview":
        return 50;
      case "confirm":
        return 75;
      case "results":
        return 100;
      default:
        return 0;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Lottery Games
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import lottery games for a specific state.
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 py-2">
          <Progress value={getProgress()} className="flex-1" />
          <span className="text-sm text-muted-foreground">
            {getProgress()}%
          </span>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-6 py-4">
              {/* State Selection */}
              <div className="space-y-2">
                <Label htmlFor="import-state">Target State *</Label>
                <Select
                  value={selectedStateId}
                  onValueChange={setSelectedStateId}
                >
                  <SelectTrigger
                    id="import-state"
                    data-testid="import-state-select"
                  >
                    <SelectValue placeholder="Select a state" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((state) => (
                      <SelectItem key={state.state_id} value={state.state_id}>
                        {state.name} ({state.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Games will be created with visibility for all stores in this
                  state.
                </p>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label htmlFor="csv-file">CSV File *</Label>
                <div className="flex items-center gap-4">
                  <input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium"
                    data-testid="import-file-input"
                  />
                </div>
                {selectedFile && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <FileCheck className="h-4 w-4" />
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)}{" "}
                    KB)
                  </div>
                )}
              </div>

              {/* Import Options */}
              <div className="space-y-4 rounded-lg border p-4">
                <h4 className="font-medium">Import Options</h4>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="skip-duplicates"
                    checked={importOptions.skipDuplicates}
                    onCheckedChange={(checked) =>
                      setImportOptions((prev) => ({
                        ...prev,
                        skipDuplicates: !!checked,
                      }))
                    }
                  />
                  <Label htmlFor="skip-duplicates" className="text-sm">
                    Skip duplicate game codes (recommended)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="update-existing"
                    checked={importOptions.updateExisting}
                    onCheckedChange={(checked) =>
                      setImportOptions((prev) => ({
                        ...prev,
                        updateExisting: !!checked,
                      }))
                    }
                  />
                  <Label htmlFor="update-existing" className="text-sm">
                    Update existing games with same code
                  </Label>
                </div>
              </div>

              {/* Download Template */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
                <div>
                  <h4 className="font-medium">Need a template?</h4>
                  <p className="text-sm text-muted-foreground">
                    Download a sample CSV with the required format.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  disabled={isDownloadingTemplate}
                >
                  {isDownloadingTemplate ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {isDownloadingTemplate
                    ? "Downloading..."
                    : "Download Template"}
                </Button>
              </div>

              {/* Error Display */}
              {validationError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{validationError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && validationResult && (
            <div className="space-y-4 py-4">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold">
                    {validationResult.preview.total_rows}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Rows</p>
                </div>
                <div className="rounded-lg border p-4 text-center bg-green-50">
                  <p className="text-2xl font-bold text-green-600">
                    {validationResult.preview.games_to_create}
                  </p>
                  <p className="text-sm text-green-600">To Create</p>
                </div>
                <div className="rounded-lg border p-4 text-center bg-blue-50">
                  <p className="text-2xl font-bold text-blue-600">
                    {validationResult.preview.games_to_update}
                  </p>
                  <p className="text-sm text-blue-600">To Update</p>
                </div>
                <div className="rounded-lg border p-4 text-center bg-red-50">
                  <p className="text-2xl font-bold text-red-600">
                    {validationResult.preview.error_rows}
                  </p>
                  <p className="text-sm text-red-600">Errors</p>
                </div>
              </div>

              {/* Validation Status */}
              {validationResult.valid ? (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">
                    Ready to Import
                  </AlertTitle>
                  <AlertDescription className="text-green-700">
                    {formatPreviewSummary(validationResult.preview)}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Validation Issues Found</AlertTitle>
                  <AlertDescription>
                    Please review the errors below and fix your CSV file.
                  </AlertDescription>
                </Alert>
              )}

              {/* Data Preview Table */}
              <div className="rounded-lg border">
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead>Game Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResult.rows.map((row) => (
                        <TableRow
                          key={row.row_number}
                          className={
                            row.status === "error"
                              ? "bg-red-50"
                              : row.status === "duplicate"
                                ? "bg-amber-50"
                                : ""
                          }
                        >
                          <TableCell className="font-mono">
                            {row.row_number}
                          </TableCell>
                          <TableCell>{getRowStatusBadge(row)}</TableCell>
                          <TableCell className="font-mono">
                            {row.data.game_code}
                          </TableCell>
                          <TableCell>{row.data.name}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.data.price)}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {row.errors && row.errors.length > 0 ? (
                              <ul className="text-sm text-red-600 list-disc list-inside">
                                {row.errors.map((error, i) => (
                                  <li key={i}>{error}</li>
                                ))}
                              </ul>
                            ) : row.existing_game ? (
                              <span className="text-sm text-muted-foreground">
                                Existing: {row.existing_game.name}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === "confirm" && validationResult && (
            <div className="space-y-6 py-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Confirm Import</AlertTitle>
                <AlertDescription>
                  You are about to import{" "}
                  {validationResult.preview.games_to_create} new games
                  {validationResult.preview.games_to_update > 0 &&
                    ` and update ${validationResult.preview.games_to_update} existing games`}{" "}
                  for <strong>{getStateName(selectedStateId)}</strong>.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <h4 className="font-medium">Import Summary</h4>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>
                    <strong>{validationResult.preview.games_to_create}</strong>{" "}
                    new games will be created
                  </li>
                  {validationResult.preview.games_to_update > 0 && (
                    <li>
                      <strong>
                        {validationResult.preview.games_to_update}
                      </strong>{" "}
                      existing games will be updated
                    </li>
                  )}
                  {validationResult.preview.duplicate_rows > 0 && (
                    <li>
                      <strong>{validationResult.preview.duplicate_rows}</strong>{" "}
                      duplicates will be skipped
                    </li>
                  )}
                  {validationResult.preview.error_rows > 0 && (
                    <li>
                      <strong>{validationResult.preview.error_rows}</strong>{" "}
                      rows with errors will be skipped
                    </li>
                  )}
                </ul>
              </div>

              {/* Commit Error */}
              {commitError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Import Failed</AlertTitle>
                  <AlertDescription>{commitError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 4: Results */}
          {step === "results" && commitResult && (
            <div className="space-y-6 py-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">
                  Import Complete
                </AlertTitle>
                <AlertDescription className="text-green-700">
                  Successfully imported lottery games for{" "}
                  {getStateName(selectedStateId)}.
                </AlertDescription>
              </Alert>

              {/* Results Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg border p-4 text-center bg-green-50">
                  <p className="text-2xl font-bold text-green-600">
                    {commitResult.summary.created}
                  </p>
                  <p className="text-sm text-green-600">Created</p>
                </div>
                <div className="rounded-lg border p-4 text-center bg-blue-50">
                  <p className="text-2xl font-bold text-blue-600">
                    {commitResult.summary.updated}
                  </p>
                  <p className="text-sm text-blue-600">Updated</p>
                </div>
                <div className="rounded-lg border p-4 text-center bg-amber-50">
                  <p className="text-2xl font-bold text-amber-600">
                    {commitResult.summary.skipped}
                  </p>
                  <p className="text-sm text-amber-600">Skipped</p>
                </div>
                <div className="rounded-lg border p-4 text-center bg-red-50">
                  <p className="text-2xl font-bold text-red-600">
                    {commitResult.summary.failed}
                  </p>
                  <p className="text-sm text-red-600">Failed</p>
                </div>
              </div>

              {/* Errors */}
              {commitResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-red-600">Errors</h4>
                  <ul className="text-sm text-red-600 list-disc list-inside">
                    {commitResult.errors.map((error, i) => (
                      <li key={i}>
                        Row {error.row_number}: {error.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Created Games */}
              {commitResult.created_games.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Created Games</h4>
                  <ScrollArea className="h-[200px] rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Game Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commitResult.created_games.map((game) => (
                          <TableRow key={game.game_id}>
                            <TableCell className="font-mono">
                              {game.row_number}
                            </TableCell>
                            <TableCell className="font-mono">
                              {game.game_code}
                            </TableCell>
                            <TableCell>{game.name}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(game.price)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <div>
            {step !== "upload" && step !== "results" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (step === "preview") setStep("upload");
                  if (step === "confirm") setStep("preview");
                }}
                disabled={isValidating || isCommitting}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {step === "results" ? "Close" : "Cancel"}
            </Button>

            {step === "upload" && (
              <Button
                onClick={handleValidate}
                disabled={!selectedFile || !selectedStateId || isValidating}
                data-testid="validate-import-button"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    Validate
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}

            {step === "preview" && validationResult && (
              <Button
                onClick={() => setStep("confirm")}
                disabled={!canProceedWithImport(validationResult.preview)}
                data-testid="proceed-to-confirm-button"
              >
                Proceed
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}

            {step === "confirm" && (
              <Button
                onClick={handleCommit}
                disabled={isCommitting}
                data-testid="commit-import-button"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirm Import
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
