"use client";

/**
 * Store Employees Tab Component
 * Displays employees assigned to a store with credential management actions
 *
 * Story 6.14: Store Settings Page with Employee/Cashier Management
 * AC #4: Display employee table with Name, Email, Role, Status
 *        Each row has "Change Email", "Reset Password", and "Set PIN" action buttons
 */

import { useState } from "react";
import { useClientEmployees, type Employee } from "@/lib/api/client-employees";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, KeyRound, Hash, Check, X } from "lucide-react";
import { ChangeEmailModal } from "./ChangeEmailModal";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { SetEmployeePINModal } from "./SetEmployeePINModal";

/**
 * Roles that support PIN authentication
 */
const PIN_ENABLED_ROLES = ["STORE_MANAGER", "SHIFT_MANAGER"];

interface StoreEmployeesTabProps {
  storeId: string;
}

/**
 * Check if an employee has a PIN-enabled role
 */
function hasPINEnabledRole(employee: Employee): boolean {
  return employee.roles.some((role) =>
    PIN_ENABLED_ROLES.includes(role.role_code),
  );
}

export function StoreEmployeesTab({ storeId }: StoreEmployeesTabProps) {
  const [changeEmailEmployee, setChangeEmailEmployee] =
    useState<Employee | null>(null);
  const [resetPasswordEmployee, setResetPasswordEmployee] =
    useState<Employee | null>(null);
  const [pinEmployee, setPinEmployee] = useState<Employee | null>(null);

  // Fetch employees filtered by store
  const {
    data: employeesData,
    isLoading,
    isError,
    error,
  } = useClientEmployees({
    store_id: storeId,
    limit: 100, // Get all employees for this store
  });

  const employees = employeesData?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="store-employees-tab">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load employees"}
        </p>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="space-y-4" data-testid="store-employees-tab">
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No employees found for this store
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="store-employees-tab">
      <Table data-testid="employee-table">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>PIN</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee, index) => {
            const showPIN = hasPINEnabledRole(employee);
            return (
              <TableRow key={employee.user_id}>
                <TableCell className="font-medium">{employee.name}</TableCell>
                <TableCell data-testid={`employee-email-${index}`}>
                  {employee.email}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {employee.roles.map((role) => (
                      <Badge key={role.user_role_id} variant="secondary">
                        {role.role_code}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell data-testid={`employee-pin-status-${index}`}>
                  {showPIN ? (
                    employee.has_pin ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-green-600 border-green-600"
                      >
                        <Check className="h-3 w-3" />
                        Set
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 text-amber-600 border-amber-600"
                      >
                        <X className="h-3 w-3" />
                        Not Set
                      </Badge>
                    )
                  ) : (
                    <span className="text-muted-foreground text-sm">N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      employee.status === "ACTIVE" ? "default" : "outline"
                    }
                  >
                    {employee.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setChangeEmailEmployee(employee)}
                      data-testid={`change-email-button-${index}`}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Change Email
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResetPasswordEmployee(employee)}
                      data-testid={`reset-password-button-${index}`}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Reset Password
                    </Button>
                    {showPIN && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPinEmployee(employee)}
                        data-testid={`set-pin-button-${index}`}
                      >
                        <Hash className="mr-2 h-4 w-4" />
                        {employee.has_pin ? "Reset PIN" : "Set PIN"}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Change Email Modal */}
      {changeEmailEmployee && (
        <ChangeEmailModal
          employee={changeEmailEmployee}
          open={!!changeEmailEmployee}
          onOpenChange={(open) => {
            if (!open) setChangeEmailEmployee(null);
          }}
        />
      )}

      {/* Reset Password Modal */}
      {resetPasswordEmployee && (
        <ResetPasswordModal
          employee={resetPasswordEmployee}
          open={!!resetPasswordEmployee}
          onOpenChange={(open) => {
            if (!open) setResetPasswordEmployee(null);
          }}
        />
      )}

      {/* Set PIN Modal */}
      {pinEmployee && (
        <SetEmployeePINModal
          employee={pinEmployee}
          storeId={storeId}
          open={!!pinEmployee}
          onOpenChange={(open) => {
            if (!open) setPinEmployee(null);
          }}
        />
      )}
    </div>
  );
}
