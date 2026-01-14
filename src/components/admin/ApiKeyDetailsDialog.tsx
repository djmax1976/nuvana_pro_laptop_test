"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useApiKey,
  useApiKeyAudit,
  ApiKeyStatus,
  ApiKeyAuditEvent,
} from "@/lib/api/api-keys";
import {
  Key,
  Store,
  Building2,
  Clock,
  Shield,
  Activity,
  Globe,
  Gauge,
  Database,
} from "lucide-react";

interface ApiKeyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string | null;
}

/**
 * ApiKeyDetailsDialog component
 * Displays detailed information about an API key including:
 * - Key identification (masked)
 * - Store and company binding
 * - Configuration (rate limits, quotas, IP allowlist)
 * - Status and lifecycle dates
 * - Audit trail
 *
 * Enterprise Standards Applied:
 * - FE-005: UI_SECURITY - Never displays full key, only prefix/suffix
 * - API-008: OUTPUT_FILTERING - Shows only safe, whitelisted fields
 */
export function ApiKeyDetailsDialog({
  open,
  onOpenChange,
  keyId,
}: ApiKeyDetailsDialogProps) {
  const [auditPage, setAuditPage] = useState(1);

  const { data: keyData, isLoading: loadingKey } = useApiKey(
    keyId || undefined,
    {
      enabled: open && !!keyId,
    },
  );

  const { data: auditData, isLoading: loadingAudit } = useApiKeyAudit(
    keyId || undefined,
    { page: auditPage, limit: 10 },
    { enabled: open && !!keyId },
  );

  const key = keyData?.data;
  const auditEvents = auditData?.data?.items || [];
  const auditPagination = auditData?.data?.pagination;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key Details
          </DialogTitle>
          <DialogDescription>
            View detailed information about this API key
          </DialogDescription>
        </DialogHeader>

        {loadingKey ? (
          <ApiKeyDetailsSkeleton />
        ) : key ? (
          <Tabs
            defaultValue="details"
            className="flex-1 overflow-hidden flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="overflow-y-auto flex-1 space-y-4 mt-4"
            >
              {/* Key Identification */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Key Identification
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Key Prefix:</span>
                    <p className="font-mono">
                      {key.key_prefix}...{key.key_suffix}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Label:</span>
                    <p>{key.label || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <p>
                      <StatusBadge status={key.status} />
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Key ID:</span>
                    <p className="font-mono text-xs">{key.api_key_id}</p>
                  </div>
                </div>
              </div>

              {/* Store Binding */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Store Binding
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Store:</span>
                    <p className="font-medium">{key.store_name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: {key.store_public_id}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Company:
                    </span>
                    <p className="font-medium">{key.company_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Timezone:</span>
                    <p>{key.timezone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">State:</span>
                    <p>{key.state_code || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Lifecycle */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Lifecycle
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <p>{new Date(key.created_at).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      by {key.created_by_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Activated:</span>
                    <p>
                      {key.activated_at
                        ? new Date(key.activated_at).toLocaleString()
                        : "Not activated"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Used:</span>
                    <p>
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Sync:</span>
                    <p>
                      {key.last_sync_at
                        ? new Date(key.last_sync_at).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expires:</span>
                    <p>
                      {key.expires_at
                        ? new Date(key.expires_at).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                  {key.device_fingerprint && (
                    <div>
                      <span className="text-muted-foreground">Device:</span>
                      <p className="font-mono text-xs truncate">
                        {key.device_fingerprint}
                      </p>
                    </div>
                  )}
                </div>

                {/* Revocation Info */}
                {key.revoked_at && (
                  <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm font-medium text-destructive">
                      Revoked on {new Date(key.revoked_at).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Reason: {key.revocation_reason}
                    </p>
                    {key.revocation_notes && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Notes: {key.revocation_notes}
                      </p>
                    )}
                    {key.revoked_by_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        By: {key.revoked_by_name}
                      </p>
                    )}
                  </div>
                )}

                {/* Rotation Info */}
                {key.rotated_from_key_id && (
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <p className="text-sm">
                      Rotated from key: {key.rotated_from_key_id}
                    </p>
                    {key.rotation_grace_ends_at && (
                      <p className="text-sm text-muted-foreground">
                        Grace period ends:{" "}
                        {new Date(key.rotation_grace_ends_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent
              value="config"
              className="overflow-y-auto flex-1 space-y-4 mt-4"
            >
              {/* Security Settings */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Security Settings
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      IP Allowlist:
                    </span>
                    {key.ip_allowlist && key.ip_allowlist.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {key.ip_allowlist.map((ip, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="font-mono"
                          >
                            {ip}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">None configured</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      IP Enforcement:
                    </span>
                    <Badge
                      variant={
                        key.ip_enforcement_enabled ? "default" : "secondary"
                      }
                    >
                      {key.ip_enforcement_enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Rate Limits & Quotas */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Gauge className="h-4 w-4" />
                  Rate Limits & Quotas
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{key.rate_limit_rpm}</p>
                    <p className="text-xs text-muted-foreground">
                      Requests/min
                    </p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{key.daily_sync_quota}</p>
                    <p className="text-xs text-muted-foreground">Syncs/day</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">
                      {key.monthly_data_quota_mb}
                    </p>
                    <p className="text-xs text-muted-foreground">MB/month</p>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              {key.metadata && Object.keys(key.metadata).length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Metadata
                  </h3>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(key.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </TabsContent>

            <TabsContent value="audit" className="overflow-y-auto flex-1 mt-4">
              <div className="rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Audit Trail
                  </h3>
                </div>

                {loadingAudit ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : auditEvents.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No audit events recorded
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEvents.map((event: ApiKeyAuditEvent) => (
                        <TableRow key={event.audit_event_id}>
                          <TableCell>
                            <EventTypeBadge type={event.event_type} />
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">{event.actor_type}</span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {event.ip_address || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(event.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {auditPagination &&
                  auditPagination.total > auditPagination.limit && (
                    <div className="p-4 border-t flex justify-center gap-2">
                      <button
                        className="text-sm text-primary hover:underline disabled:opacity-50"
                        onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                        disabled={auditPage === 1}
                      >
                        Previous
                      </button>
                      <span className="text-sm text-muted-foreground">
                        Page {auditPage}
                      </span>
                      <button
                        className="text-sm text-primary hover:underline disabled:opacity-50"
                        onClick={() => setAuditPage((p) => p + 1)}
                        disabled={auditEvents.length < auditPagination.limit}
                      >
                        Next
                      </button>
                    </div>
                  )}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            API key not found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: ApiKeyStatus }) {
  const variants: Record<
    ApiKeyStatus,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    ACTIVE: "default",
    PENDING: "outline",
    SUSPENDED: "secondary",
    EXPIRED: "secondary",
    REVOKED: "destructive",
  };

  return <Badge variant={variants[status]}>{status}</Badge>;
}

/**
 * Event type badge component
 */
function EventTypeBadge({ type }: { type: string }) {
  const getVariant = (
    type: string,
  ): "default" | "secondary" | "destructive" | "outline" => {
    if (type.includes("REVOKE") || type.includes("FAIL")) return "destructive";
    if (type.includes("CREATE") || type.includes("ACTIVATE")) return "default";
    return "secondary";
  };

  return (
    <Badge variant={getVariant(type)} className="text-xs">
      {type.replace(/_/g, " ")}
    </Badge>
  );
}

/**
 * Loading skeleton
 */
function ApiKeyDetailsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
