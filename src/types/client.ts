/**
 * Client types for frontend
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
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  companyCount?: number;
  _count?: {
    companies: number;
  };
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

export interface ListClientsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ClientStatus;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListClientsResponse {
  success: boolean;
  data: Client[];
  meta: PaginationMeta;
}

export interface ClientResponse {
  success: boolean;
  data: Client;
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
}
