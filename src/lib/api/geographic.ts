/**
 * Geographic Reference API client functions
 * Provides functions for fetching US states, counties, cities, and ZIP codes
 *
 * Story: State-Scoped Lottery Games Phase
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import apiClient from "./client";

// ============ Types ============

/**
 * US State response
 */
export interface USStateResponse {
  state_id: string;
  code: string;
  name: string;
  fips_code: string;
  is_active: boolean;
  lottery_enabled: boolean;
  timezone_default: string | null;
  tax_rate_state?: number | null;
  lottery_commission_name?: string | null;
  lottery_commission_phone?: string | null;
  lottery_commission_url?: string | null;
}

/**
 * US County response
 */
export interface USCountyResponse {
  county_id: string;
  state_id: string;
  name: string;
  fips_code: string;
  county_seat: string | null;
  is_active: boolean;
}

/**
 * US City response
 */
export interface USCityResponse {
  city_id: string;
  state_id: string;
  county_id: string;
  name: string;
  is_active: boolean;
  is_incorporated: boolean;
}

/**
 * US ZIP Code response
 */
export interface USZipCodeResponse {
  zip_code: string;
  state_id: string;
  county_id: string | null;
  city_id: string | null;
  city_name: string;
  is_active: boolean;
  is_primary: boolean;
}

/**
 * ZIP Code lookup response with related data
 */
export interface ZipCodeLookupResponse {
  zip_code: string;
  city_name: string;
  state: {
    state_id: string;
    code: string;
    name: string;
  };
  county: {
    county_id: string;
    name: string;
  } | null;
  city: {
    city_id: string;
    name: string;
  } | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

// ============ Query Parameters ============

export interface ListStatesQueryParams {
  is_active?: boolean;
  lottery_enabled?: boolean;
}

export interface ListCountiesQueryParams {
  state_id?: string;
  state_code?: string;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListCitiesQueryParams {
  state_id?: string;
  state_code?: string;
  county_id?: string;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListZipCodesQueryParams {
  state_id?: string;
  state_code?: string;
  county_id?: string;
  city_id?: string;
  city_name?: string;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============ API Functions ============

/**
 * Get all US states
 * GET /api/geographic/states
 * @param params - Optional query filters (is_active, lottery_enabled)
 * @returns List of US states
 */
export async function getStates(
  params?: ListStatesQueryParams,
): Promise<ApiResponse<USStateResponse[]>> {
  const response = await apiClient.get<ApiResponse<USStateResponse[]>>(
    "/api/geographic/states",
    { params },
  );
  return response.data;
}

/**
 * Get lottery-enabled states only
 * Convenience function for state selection dropdowns
 * @returns List of states where lottery is enabled
 */
export async function getLotteryEnabledStates(): Promise<
  ApiResponse<USStateResponse[]>
> {
  return getStates({ is_active: true, lottery_enabled: true });
}

/**
 * Get a single US state by ID
 * GET /api/geographic/states/:stateId
 * @param stateId - State UUID
 * @returns State details
 */
export async function getStateById(
  stateId: string,
): Promise<ApiResponse<USStateResponse>> {
  const response = await apiClient.get<ApiResponse<USStateResponse>>(
    `/api/geographic/states/${stateId}`,
  );
  return response.data;
}

/**
 * Get counties, optionally filtered by state
 * GET /api/geographic/counties
 * @param params - Query filters
 * @returns Paginated list of counties
 */
export async function getCounties(
  params?: ListCountiesQueryParams,
): Promise<PaginatedResponse<USCountyResponse>> {
  const response = await apiClient.get<PaginatedResponse<USCountyResponse>>(
    "/api/geographic/counties",
    { params },
  );
  return response.data;
}

/**
 * Get counties for a specific state
 * GET /api/geographic/states/:stateId/counties
 * @param stateId - State UUID
 * @param search - Optional search string
 * @param limit - Max results (default 200)
 * @returns List of counties
 */
export async function getCountiesByState(
  stateId: string,
  search?: string,
  limit?: number,
): Promise<ApiResponse<USCountyResponse[]>> {
  const response = await apiClient.get<ApiResponse<USCountyResponse[]>>(
    `/api/geographic/states/${stateId}/counties`,
    { params: { search, limit } },
  );
  return response.data;
}

/**
 * Get cities, optionally filtered by state or county
 * GET /api/geographic/cities
 * @param params - Query filters
 * @returns Paginated list of cities
 */
export async function getCities(
  params?: ListCitiesQueryParams,
): Promise<PaginatedResponse<USCityResponse>> {
  const response = await apiClient.get<PaginatedResponse<USCityResponse>>(
    "/api/geographic/cities",
    { params },
  );
  return response.data;
}

/**
 * Get cities for a specific state
 * GET /api/geographic/states/:stateId/cities
 * @param stateId - State UUID
 * @param countyId - Optional county filter
 * @param search - Optional search string
 * @param limit - Max results (default 100)
 * @returns List of cities
 */
export async function getCitiesByState(
  stateId: string,
  countyId?: string,
  search?: string,
  limit?: number,
): Promise<ApiResponse<USCityResponse[]>> {
  const response = await apiClient.get<ApiResponse<USCityResponse[]>>(
    `/api/geographic/states/${stateId}/cities`,
    { params: { county_id: countyId, search, limit } },
  );
  return response.data;
}

/**
 * Get ZIP codes, optionally filtered
 * GET /api/geographic/zip-codes
 * @param params - Query filters
 * @returns Paginated list of ZIP codes
 */
export async function getZipCodes(
  params?: ListZipCodesQueryParams,
): Promise<PaginatedResponse<USZipCodeResponse>> {
  const response = await apiClient.get<PaginatedResponse<USZipCodeResponse>>(
    "/api/geographic/zip-codes",
    { params },
  );
  return response.data;
}

/**
 * Lookup a specific ZIP code for address autocomplete
 * GET /api/geographic/zip-codes/:zipCode
 * @param zipCode - 5-digit ZIP code
 * @returns ZIP code details with state, county, and city
 */
export async function lookupZipCode(
  zipCode: string,
): Promise<ApiResponse<ZipCodeLookupResponse>> {
  const response = await apiClient.get<ApiResponse<ZipCodeLookupResponse>>(
    `/api/geographic/zip-codes/${zipCode}`,
  );
  return response.data;
}

/**
 * Get ZIP codes for a specific state
 * GET /api/geographic/states/:stateId/zip-codes
 * @param stateId - State UUID
 * @param cityName - Optional city name filter
 * @param search - Optional ZIP code prefix search
 * @param limit - Max results (default 100)
 * @returns List of ZIP codes
 */
export async function getZipCodesByState(
  stateId: string,
  cityName?: string,
  search?: string,
  limit?: number,
): Promise<ApiResponse<USZipCodeResponse[]>> {
  const response = await apiClient.get<ApiResponse<USZipCodeResponse[]>>(
    `/api/geographic/states/${stateId}/zip-codes`,
    { params: { city_name: cityName, search, limit } },
  );
  return response.data;
}
