/**
 * Client types for the Client Management API
 */

export enum ClientStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export interface Client {
  client_id: string;
  public_id: string; // External-facing ID (clt_xxxxx)
  name: string;
  status: ClientStatus;
  metadata?: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface ClientWithCompanyCount extends Client {
  _count?: {
    companies: number;
  };
  companyCount?: number;
}

export interface CreateClientInput {
  name: string;
  status?: ClientStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateClientInput {
  name?: string;
  status?: ClientStatus;
  metadata?: Record<string, unknown>;
}

export interface ClientListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: ClientStatus;
  includeDeleted?: boolean;
}

export interface PaginatedClientResult {
  data: ClientWithCompanyCount[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
