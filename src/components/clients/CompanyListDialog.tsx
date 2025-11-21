"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Company {
  company_id: string;
  public_id: string | null;
  name: string;
}

interface CompanyListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: Company[];
  clientName: string;
}

/**
 * CompanyListDialog component
 * Displays a modal with a list of companies associated with a client
 */
export function CompanyListDialog({
  open,
  onOpenChange,
  companies,
  clientName,
}: CompanyListDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Companies - {clientName}</DialogTitle>
          <DialogDescription>
            {companies.length === 0
              ? "No companies associated with this client"
              : `${companies.length} ${companies.length === 1 ? "company" : "companies"} associated with this client`}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-96 overflow-y-auto">
          {companies.length > 0 ? (
            <ul className="space-y-2">
              {companies.map((company) => (
                <li
                  key={company.company_id}
                  className="rounded-md border p-3 hover:bg-accent transition-colors"
                >
                  <p className="font-medium">{company.name}</p>
                  {company.public_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {company.public_id}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No companies found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
