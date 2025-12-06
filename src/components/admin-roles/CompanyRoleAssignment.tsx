"use client";

/**
 * Company Role Assignment Component
 * Allows Super Admins to assign which roles are available to each company
 */

import { useState } from "react";
import {
  useCompaniesWithRoles,
  useAssignableRoles,
  useSetCompanyRoles,
  RoleWithDetails,
  CompanyWithAllowedRoles,
  getScopeDisplayName,
  getScopeBadgeColor,
} from "@/lib/api/admin-roles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Shield,
  AlertCircle,
  RefreshCw,
  Search,
  Save,
  X,
  ChevronRight,
} from "lucide-react";

export function CompanyRoleAssignment() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] =
    useState<CompanyWithAllowedRoles | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingCompany, setPendingCompany] =
    useState<CompanyWithAllowedRoles | null>(null);

  const { toast } = useToast();

  const {
    data: companies,
    isLoading: isLoadingCompanies,
    isError: isCompaniesError,
    error: companiesError,
    refetch: refetchCompanies,
  } = useCompaniesWithRoles();

  const {
    data: assignableRoles,
    isLoading: isLoadingRoles,
    isError: isRolesError,
    error: rolesError,
    refetch: refetchAssignableRoles,
  } = useAssignableRoles();

  const setCompanyRolesMutation = useSetCompanyRoles();

  // Filter companies by search
  const filteredCompanies = companies?.filter(
    (company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.code.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Handle company selection
  const handleSelectCompany = (company: CompanyWithAllowedRoles) => {
    if (hasChanges) {
      setPendingCompany(company);
      setShowSaveDialog(true);
      return;
    }
    setSelectedCompany(company);
    setSelectedRoleIds(company.allowed_roles.map((ar) => ar.role_id));
    setHasChanges(false);
  };

  // Handle role toggle
  const handleRoleToggle = (roleId: string, checked: boolean) => {
    setSelectedRoleIds((prev) => {
      if (checked) {
        return [...prev, roleId];
      }
      return prev.filter((id) => id !== roleId);
    });
    setHasChanges(true);
  };

  // Handle select all for a scope
  const handleSelectAllScope = (
    scope: "SYSTEM" | "COMPANY" | "STORE",
    roles: RoleWithDetails[],
  ) => {
    const scopeRoleIds = roles
      .filter((r) => r.scope === scope)
      .map((r) => r.role_id);
    const allSelected = scopeRoleIds.every((id) =>
      selectedRoleIds.includes(id),
    );

    if (allSelected) {
      setSelectedRoleIds((prev) =>
        prev.filter((id) => !scopeRoleIds.includes(id)),
      );
    } else {
      setSelectedRoleIds((prev) =>
        Array.from(new Set([...prev, ...scopeRoleIds])),
      );
    }
    setHasChanges(true);
  };

  // Handle save
  const handleSave = async (): Promise<boolean> => {
    if (!selectedCompany) return false;

    try {
      await setCompanyRolesMutation.mutateAsync({
        companyId: selectedCompany.company_id,
        roleIds: selectedRoleIds,
      });
      toast({
        title: "Roles Updated",
        description: `Roles for "${selectedCompany.name}" have been updated.`,
      });
      setHasChanges(false);
      refetchCompanies();
      return true;
    } catch (err) {
      toast({
        title: "Update Failed",
        description:
          err instanceof Error ? err.message : "Failed to update company roles",
        variant: "destructive",
      });
      return false;
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (selectedCompany) {
      setSelectedRoleIds(selectedCompany.allowed_roles.map((ar) => ar.role_id));
    }
    setHasChanges(false);
  };

  // Handle discard changes dialog
  const handleDiscardChanges = () => {
    setHasChanges(false);
    setShowSaveDialog(false);
    if (pendingCompany) {
      setSelectedCompany(pendingCompany);
      setSelectedRoleIds(pendingCompany.allowed_roles.map((ar) => ar.role_id));
      setPendingCompany(null);
    }
  };

  // Group roles by scope using Map for safe dynamic access
  const rolesByScope = assignableRoles?.reduce<Map<string, RoleWithDetails[]>>(
    (acc, role) => {
      const existing = acc.get(role.scope);
      if (existing) {
        existing.push(role);
      } else {
        acc.set(role.scope, [role]);
      }
      return acc;
    },
    new Map(),
  );

  // Loading state
  if (isLoadingCompanies || isLoadingRoles) {
    return (
      <div className="space-y-4" data-testid="company-role-assignment-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full mb-2" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-8 w-full mb-2" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (isCompaniesError || isRolesError) {
    return (
      <div
        className="rounded-lg border border-destructive p-6"
        data-testid="company-role-assignment-error"
      >
        <div className="flex items-center gap-2 text-destructive mb-4">
          <AlertCircle className="h-5 w-5" />
          <h3 className="font-semibold">Error Loading Data</h3>
        </div>
        <p className="text-muted-foreground mb-4">
          {companiesError instanceof Error
            ? companiesError.message
            : rolesError instanceof Error
              ? rolesError.message
              : "Failed to load data. Please try again."}
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await refetchCompanies();
            await refetchAssignableRoles();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="company-role-assignment">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          Company Role Assignment
        </h2>
        <p className="text-muted-foreground">
          Control which roles are available to each company
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Companies
            </CardTitle>
            <CardDescription>
              Select a company to manage its available roles
            </CardDescription>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            {!filteredCompanies || filteredCompanies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No companies found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCompanies.map((company) => (
                  <div
                    key={company.company_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCompany?.company_id === company.company_id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => handleSelectCompany(company)}
                    data-testid={`company-item-${company.company_id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{company.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {company.code}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {company.allowed_roles.length} roles
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role Assignment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {selectedCompany
                ? `Roles for ${selectedCompany.name}`
                : "Select a Company"}
            </CardTitle>
            <CardDescription>
              {selectedCompany
                ? "Check the roles this company should have access to"
                : "Select a company from the list to manage its roles"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedCompany ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a company to manage its available roles</p>
              </div>
            ) : !rolesByScope || rolesByScope.size === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No assignable roles available</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(["COMPANY", "STORE"] as const).map((scope) => {
                  const scopeRoles = rolesByScope.get(scope) ?? [];
                  if (scopeRoles.length === 0) return null;

                  const allSelected = scopeRoles.every((r) =>
                    selectedRoleIds.includes(r.role_id),
                  );
                  const someSelected =
                    !allSelected &&
                    scopeRoles.some((r) => selectedRoleIds.includes(r.role_id));

                  return (
                    <div key={scope}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge className={getScopeBadgeColor(scope)}>
                            {getScopeDisplayName(scope)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            ({scopeRoles.length} roles)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleSelectAllScope(scope, assignableRoles || [])
                          }
                        >
                          {allSelected ? "Deselect All" : "Select All"}
                        </Button>
                      </div>
                      <div className="space-y-2 pl-2">
                        {scopeRoles.map((role) => (
                          <div
                            key={role.role_id}
                            className="flex items-center gap-3 p-2 rounded hover:bg-muted/50"
                          >
                            <Checkbox
                              id={`role-${role.role_id}`}
                              checked={selectedRoleIds.includes(role.role_id)}
                              onCheckedChange={(checked) =>
                                handleRoleToggle(role.role_id, checked === true)
                              }
                            />
                            <label
                              htmlFor={`role-${role.role_id}`}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="font-medium">{role.code}</div>
                              {role.description && (
                                <div className="text-sm text-muted-foreground">
                                  {role.description}
                                </div>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Action buttons */}
                {hasChanges && (
                  <div className="flex items-center justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={handleCancel}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={setCompanyRolesMutation.isPending}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {setCompanyRolesMutation.isPending
                        ? "Saving..."
                        : "Save Changes"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unsaved changes dialog */}
      <Dialog
        open={showSaveDialog}
        onOpenChange={(open) => {
          setShowSaveDialog(open);
          if (!open) {
            // Clear pending company if dialog is closed without saving/discarding
            setPendingCompany(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Do you want to save them before
              switching companies?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleDiscardChanges}>
              Discard
            </Button>
            <Button
              onClick={async () => {
                const success = await handleSave();
                setShowSaveDialog(false);
                if (success && pendingCompany) {
                  setSelectedCompany(pendingCompany);
                  setSelectedRoleIds(
                    pendingCompany.allowed_roles.map((ar) => ar.role_id),
                  );
                  setPendingCompany(null);
                } else if (!success) {
                  // Clear pending company if save failed
                  setPendingCompany(null);
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
