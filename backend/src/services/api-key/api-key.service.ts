/**
 * API Key Service
 *
 * Enterprise-grade API key management for desktop POS applications.
 * Handles key generation, validation, rotation, and revocation.
 *
 * Security Features:
 * - SHA-256 hashing (raw key never stored)
 * - Cryptographically secure key generation
 * - Real-time revocation via Redis
 * - IP allowlist support
 * - Per-key rate limiting
 * - Comprehensive audit logging
 *
 * @module services/api-key/api-key.service
 */

import { randomBytes, createHash } from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../utils/db";
import { getRedisClient } from "../../utils/redis";
import { apiKeyAuditService } from "./api-key-audit.service";
import type { Prisma, ApiKeyStatus } from "@prisma/client";
import type {
  ApiKeyIdentityPayload,
  ApiKeyMetadata,
  GeneratedApiKey,
  CreateApiKeyInput,
  UpdateApiKeyInput,
  RotateApiKeyInput,
  RevokeApiKeyInput,
  ApiKeyValidationResult,
  ApiKeyRecord,
  ApiKeyIdentity,
  ApiKeyListItem,
  ApiKeyDetails,
  ApiKeyListFilter,
  ApiKeyPaginationOptions,
  ApiKeyListResponse,
} from "../../types/api-key.types";

// ============================================================================
// Constants
// ============================================================================

/** Key format prefix */
const KEY_PREFIX = "nuvpos_sk_";

/** Key format regex: nuvpos_sk_str_{store_id}_{24-32 alphanumeric secret} */
const KEY_FORMAT_REGEX = /^nuvpos_sk_str_[a-z0-9]+_[A-Za-z0-9]{24,32}$/;

/** Redis key prefix for revocation cache */
const REVOCATION_CACHE_PREFIX = "api_key:revoked:";

/** Redis key prefix for rate limiting */
const RATE_LIMIT_CACHE_PREFIX = "api_key:rate:";

/** Revocation cache TTL (7 days) */
const REVOCATION_CACHE_TTL = 7 * 24 * 60 * 60;

/** Rate limit window (60 seconds) */
const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Default offline permissions */
const DEFAULT_OFFLINE_PERMISSIONS = [
  // Shift operations
  "SHIFT_OPEN",
  "SHIFT_CLOSE",
  "SHIFT_READ",
  "SHIFT_RECONCILE",
  // Transaction operations
  "TRANSACTION_CREATE",
  "TRANSACTION_READ",
  // Lottery operations
  "LOTTERY_PACK_READ",
  "LOTTERY_PACK_ACTIVATE",
  "LOTTERY_SHIFT_OPEN",
  "LOTTERY_SHIFT_CLOSE",
  // Cashier operations
  "CASHIER_READ",
  // Reports
  "X_REPORT_GENERATE",
  "X_REPORT_READ",
];

// ============================================================================
// Service Class
// ============================================================================

/**
 * API Key Service
 *
 * Manages the complete lifecycle of API keys for desktop POS applications.
 */
class ApiKeyService {
  private readonly jwtSecret: string;

  constructor() {
    // Use dedicated secret or fall back to main JWT secret
    this.jwtSecret = process.env.API_KEY_SECRET || process.env.JWT_SECRET || "";

    if (!this.jwtSecret) {
      throw new Error(
        "API_KEY_SECRET or JWT_SECRET must be set in environment variables",
      );
    }
  }

  // ==========================================================================
  // Key Generation
  // ==========================================================================

  /**
   * Generate a new API key for a store
   *
   * IMPORTANT: The raw key is returned ONCE and must be shown to the admin immediately.
   * It is NEVER stored - only the SHA-256 hash is persisted.
   *
   * @param input - Key creation parameters
   * @param createdBy - User ID of the admin creating the key
   * @returns Generated key with raw key (show once) and database record
   */
  async createApiKey(
    input: CreateApiKeyInput,
    createdBy: string,
  ): Promise<{ key: GeneratedApiKey; record: ApiKeyRecord }> {
    // Fetch store and company info
    const store = await prisma.store.findUnique({
      where: { store_id: input.storeId },
      include: {
        company: true,
        state: true,
      },
    });

    if (!store) {
      throw new Error(`Store not found: ${input.storeId}`);
    }

    // Check for existing active key
    const existingActiveKey = await prisma.apiKey.findFirst({
      where: {
        store_id: input.storeId,
        status: "ACTIVE",
      },
    });

    if (existingActiveKey) {
      throw new Error(
        `Store ${store.public_id} already has an active API key. Use rotation to replace it.`,
      );
    }

    // Generate the key
    const generatedKey = this.generateKey(store.public_id, {
      store_id: store.store_id,
      store_name: store.name,
      store_public_id: store.public_id,
      company_id: store.company_id,
      company_name: store.company.name,
      timezone: store.timezone,
      state_id: store.state_id || undefined,
      state_code: store.state?.code,
      metadata: input.metadata || {},
    });

    // Create database record
    const record = await prisma.apiKey.create({
      data: {
        store_id: input.storeId,
        company_id: store.company_id,
        key_prefix: generatedKey.keyPrefix,
        key_hash: generatedKey.keyHash,
        key_suffix: generatedKey.keySuffix,
        label: input.label,
        identity_payload: generatedKey.identityPayload,
        payload_version: 1,
        metadata: (input.metadata as Prisma.JsonObject) || undefined,
        ip_allowlist: input.ipAllowlist || [],
        ip_enforcement_enabled: input.ipEnforcementEnabled || false,
        rate_limit_rpm: input.rateLimitRpm || 100,
        daily_sync_quota: input.dailySyncQuota || 1000,
        monthly_data_quota_mb: input.monthlyDataQuotaMb || 10000,
        status: "ACTIVE",
        activated_at: new Date(),
        expires_at: input.expiresAt,
        created_by: createdBy,
      },
    });

    // Log audit event
    await apiKeyAuditService.logEvent({
      apiKeyId: record.api_key_id,
      eventType: "CREATED",
      actorUserId: createdBy,
      actorType: "ADMIN",
      eventDetails: {
        store_id: input.storeId,
        store_public_id: store.public_id,
        label: input.label,
      },
    });

    return {
      key: generatedKey,
      record: this.mapToApiKeyRecord(record),
    };
  }

  /**
   * Generate API key components
   *
   * Key format: nuvpos_sk_{store_public_id}_{random_32_chars}
   */
  private generateKey(
    storePublicId: string,
    identityData: Omit<
      ApiKeyIdentityPayload,
      "v" | "iss" | "iat" | "jti" | "offline_permissions"
    >,
  ): GeneratedApiKey {
    // Generate random suffix (32 alphanumeric characters)
    const randomSuffix = randomBytes(24)
      .toString("base64")
      .replace(/[^A-Za-z0-9]/g, "")
      .substring(0, 32);

    // Construct full key
    const keyPrefix = `${KEY_PREFIX}${storePublicId}`;
    const rawKey = `${keyPrefix}_${randomSuffix}`;

    // Generate SHA-256 hash for storage
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    // Extract last 4 characters for display
    const keySuffix = rawKey.slice(-4);

    // Create identity payload
    const jti = createHash("sha256")
      .update(rawKey + Date.now())
      .digest("hex")
      .substring(0, 36);

    const identityPayload: ApiKeyIdentityPayload = {
      v: 1,
      store_id: identityData.store_id,
      store_name: identityData.store_name,
      store_public_id: identityData.store_public_id,
      company_id: identityData.company_id,
      company_name: identityData.company_name,
      timezone: identityData.timezone,
      state_id: identityData.state_id,
      state_code: identityData.state_code,
      offline_permissions: DEFAULT_OFFLINE_PERMISSIONS,
      metadata: identityData.metadata,
      iss: "nuvana-backend",
      iat: Math.floor(Date.now() / 1000),
      jti,
    };

    // Sign the identity payload
    const signedPayload = jwt.sign(identityPayload, this.jwtSecret, {
      algorithm: "HS256",
    });

    return {
      rawKey,
      keyHash,
      keyPrefix,
      keySuffix,
      identityPayload: signedPayload,
    };
  }

  // ==========================================================================
  // Key Validation
  // ==========================================================================

  /**
   * Validate an API key
   *
   * Validation order (optimized for performance):
   * 1. Format validation (fast, no I/O)
   * 2. Redis revocation check (fast, cached)
   * 3. Database lookup by hash
   * 4. Status and expiration checks
   *
   * @param rawKey - The full API key to validate
   * @param clientIp - Client IP for allowlist check
   * @returns Validation result with identity if valid
   */
  async validateApiKey(
    rawKey: string,
    clientIp?: string,
  ): Promise<ApiKeyValidationResult> {
    // 1. Format validation
    if (!KEY_FORMAT_REGEX.test(rawKey)) {
      return {
        valid: false,
        errorCode: "INVALID_FORMAT",
        errorMessage: "Invalid API key format",
      };
    }

    // 2. Hash the key
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    // 3. Check Redis revocation cache
    if (await this.isKeyRevoked(keyHash)) {
      return {
        valid: false,
        errorCode: "KEY_REVOKED",
        errorMessage: "API key has been revoked",
      };
    }

    // 4. Database lookup
    const keyRecord = await prisma.apiKey.findUnique({
      where: { key_hash: keyHash },
      include: {
        store: {
          select: { name: true, timezone: true, state: true, public_id: true },
        },
        company: {
          select: { name: true },
        },
      },
    });

    if (!keyRecord) {
      return {
        valid: false,
        errorCode: "KEY_NOT_FOUND",
        errorMessage: "Invalid API key",
      };
    }

    // 5. Status check
    if (keyRecord.status === "PENDING") {
      return {
        valid: false,
        errorCode: "KEY_PENDING",
        errorMessage: "API key has not been activated",
      };
    }

    if (keyRecord.status === "SUSPENDED") {
      return {
        valid: false,
        errorCode: "KEY_SUSPENDED",
        errorMessage: "API key is suspended",
      };
    }

    if (keyRecord.status === "REVOKED") {
      // Cache the revocation for faster future checks
      await this.cacheRevocation(keyHash, "REVOKED");
      return {
        valid: false,
        errorCode: "KEY_REVOKED",
        errorMessage: "API key has been revoked",
      };
    }

    if (keyRecord.status === "EXPIRED") {
      return {
        valid: false,
        errorCode: "KEY_EXPIRED",
        errorMessage: "API key has expired",
      };
    }

    // 6. Expiration check
    if (keyRecord.expires_at && keyRecord.expires_at < new Date()) {
      // Update status to EXPIRED
      await prisma.apiKey.update({
        where: { api_key_id: keyRecord.api_key_id },
        data: { status: "EXPIRED" },
      });
      return {
        valid: false,
        errorCode: "KEY_EXPIRED",
        errorMessage: "API key has expired",
      };
    }

    // 7. IP allowlist check
    if (
      clientIp &&
      keyRecord.ip_enforcement_enabled &&
      keyRecord.ip_allowlist.length > 0
    ) {
      if (!this.isIpAllowed(clientIp, keyRecord.ip_allowlist)) {
        await apiKeyAuditService.logEvent({
          apiKeyId: keyRecord.api_key_id,
          eventType: "IP_BLOCKED",
          actorType: "DEVICE",
          ipAddress: clientIp,
          eventDetails: {
            blocked_ip: clientIp,
            allowlist: keyRecord.ip_allowlist,
          },
        });
        return {
          valid: false,
          errorCode: "IP_NOT_ALLOWED",
          errorMessage: "Request from this IP address is not allowed",
        };
      }
    }

    // 8. Decode identity payload
    const payload = jwt.verify(
      keyRecord.identity_payload,
      this.jwtSecret,
    ) as ApiKeyIdentityPayload;

    // Build identity
    const identity: ApiKeyIdentity = {
      apiKeyId: keyRecord.api_key_id,
      storeId: payload.store_id,
      storeName: payload.store_name,
      storePublicId: payload.store_public_id,
      companyId: payload.company_id,
      companyName: payload.company_name,
      timezone: payload.timezone,
      stateId: payload.state_id,
      stateCode: payload.state_code,
      offlinePermissions: payload.offline_permissions,
      metadata: payload.metadata,
      isElevated: false,
    };

    return {
      valid: true,
      apiKey: this.mapToApiKeyRecord(keyRecord),
      identity,
    };
  }

  /**
   * Check if an IP is in the allowlist
   * Supports CIDR notation
   */
  private isIpAllowed(ip: string, allowlist: string[]): boolean {
    for (const entry of allowlist) {
      if (entry.includes("/")) {
        // CIDR notation - basic implementation
        if (this.isIpInCidr(ip, entry)) {
          return true;
        }
      } else {
        // Exact match
        if (ip === entry) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if IP is in CIDR range
   * Basic implementation for IPv4
   */
  private isIpInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split("/");
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
    const ipNum = this.ipToNumber(ip);
    const rangeNum = this.ipToNumber(range);
    return (ipNum & mask) === (rangeNum & mask);
  }

  private ipToNumber(ip: string): number {
    return ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  }

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  /**
   * Check and increment rate limit for an API key
   *
   * @param keyHash - Hash of the API key
   * @param limit - Rate limit (requests per minute)
   * @returns Whether the request is allowed
   */
  async checkRateLimit(
    keyHash: string,
    limit: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    if (limit === 0) {
      // Unlimited
      return { allowed: true, remaining: Infinity, resetAt: new Date() };
    }

    const redis = await getRedisClient();
    if (!redis) {
      // Fail open if Redis unavailable
      return { allowed: true, remaining: limit, resetAt: new Date() };
    }

    const key = `${RATE_LIMIT_CACHE_PREFIX}${keyHash}`;
    const count = await redis.incr(key);

    if (count === 1) {
      // First request in window - set expiry
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    const ttl = await redis.ttl(key);
    const resetAt = new Date(Date.now() + ttl * 1000);
    const remaining = Math.max(0, limit - count);

    return {
      allowed: count <= limit,
      remaining,
      resetAt,
    };
  }

  // ==========================================================================
  // Revocation
  // ==========================================================================

  /**
   * Revoke an API key
   *
   * Immediately invalidates the key and sets Redis cache for fast rejection.
   */
  async revokeApiKey(
    apiKeyId: string,
    input: RevokeApiKeyInput,
    revokedBy: string,
    ipAddress?: string,
  ): Promise<void> {
    const keyRecord = await prisma.apiKey.findUnique({
      where: { api_key_id: apiKeyId },
    });

    if (!keyRecord) {
      throw new Error(`API key not found: ${apiKeyId}`);
    }

    if (keyRecord.status === "REVOKED") {
      throw new Error("API key is already revoked");
    }

    // Update database
    await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: {
        status: "REVOKED",
        revoked_at: new Date(),
        revoked_by: revokedBy,
        revocation_reason: input.reason,
        revocation_notes: input.notes,
      },
    });

    // Cache revocation in Redis for fast rejection
    await this.cacheRevocation(keyRecord.key_hash, input.reason);

    // Log audit event
    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType: "REVOKED",
      actorUserId: revokedBy,
      actorType: "ADMIN",
      ipAddress,
      eventDetails: {
        reason: input.reason,
        notes: input.notes,
      },
    });

    // TODO: Send admin notification if reason is COMPROMISED
    if (input.reason === "COMPROMISED" && input.notifyAdmins) {
      console.log(
        `[ApiKeyService] Key ${apiKeyId} marked as compromised - notification pending`,
      );
    }
  }

  /**
   * Check if a key is revoked (via Redis cache)
   */
  private async isKeyRevoked(keyHash: string): Promise<boolean> {
    const redis = await getRedisClient();
    if (!redis) {
      return false; // Fail open if Redis unavailable
    }

    const key = `${REVOCATION_CACHE_PREFIX}${keyHash}`;
    const result = await redis.get(key);
    return result !== null;
  }

  /**
   * Cache a revocation in Redis
   */
  private async cacheRevocation(
    keyHash: string,
    reason: string,
  ): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }

    const key = `${REVOCATION_CACHE_PREFIX}${keyHash}`;
    await redis.setEx(
      key,
      REVOCATION_CACHE_TTL,
      JSON.stringify({
        reason,
        revoked_at: new Date().toISOString(),
      }),
    );
  }

  // ==========================================================================
  // Key Rotation
  // ==========================================================================

  /**
   * Rotate an API key
   *
   * Creates a new key while keeping the old one active during the grace period.
   * The old key is marked for rotation and will be revoked after the grace period.
   */
  async rotateApiKey(
    apiKeyId: string,
    input: RotateApiKeyInput,
    rotatedBy: string,
    ipAddress?: string,
  ): Promise<{ key: GeneratedApiKey; record: ApiKeyRecord }> {
    const oldKeyRecord = await prisma.apiKey.findUnique({
      where: { api_key_id: apiKeyId },
      include: {
        store: {
          include: {
            company: true,
            state: true,
          },
        },
      },
    });

    if (!oldKeyRecord) {
      throw new Error(`API key not found: ${apiKeyId}`);
    }

    if (oldKeyRecord.status !== "ACTIVE") {
      throw new Error(`Cannot rotate key with status: ${oldKeyRecord.status}`);
    }

    const gracePeriodDays = input.gracePeriodDays || 7;
    const graceEndsAt = new Date();
    graceEndsAt.setDate(graceEndsAt.getDate() + gracePeriodDays);

    // Generate new key
    const store = oldKeyRecord.store;
    const generatedKey = this.generateKey(store.public_id, {
      store_id: store.store_id,
      store_name: store.name,
      store_public_id: store.public_id,
      company_id: store.company_id,
      company_name: store.company.name,
      timezone: store.timezone,
      state_id: store.state_id || undefined,
      state_code: store.state?.code,
      metadata: input.preserveMetadata
        ? (oldKeyRecord.metadata as ApiKeyMetadata) || {}
        : {},
    });

    // Create new key record
    const newKeyRecord = await prisma.apiKey.create({
      data: {
        store_id: store.store_id,
        company_id: store.company_id,
        key_prefix: generatedKey.keyPrefix,
        key_hash: generatedKey.keyHash,
        key_suffix: generatedKey.keySuffix,
        label: input.newLabel || oldKeyRecord.label,
        identity_payload: generatedKey.identityPayload,
        payload_version: 1,
        metadata: input.preserveMetadata
          ? (oldKeyRecord.metadata as Prisma.JsonObject)
          : undefined,
        ip_allowlist: input.preserveIpAllowlist
          ? oldKeyRecord.ip_allowlist
          : [],
        ip_enforcement_enabled: input.preserveIpAllowlist
          ? oldKeyRecord.ip_enforcement_enabled
          : false,
        rate_limit_rpm: oldKeyRecord.rate_limit_rpm,
        daily_sync_quota: oldKeyRecord.daily_sync_quota,
        monthly_data_quota_mb: oldKeyRecord.monthly_data_quota_mb,
        status: "PENDING",
        rotated_from_key_id: apiKeyId,
        created_by: rotatedBy,
      },
    });

    // Update old key with grace period end
    await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: {
        rotation_grace_ends_at: graceEndsAt,
      },
    });

    // Log audit event for old key
    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType: "ROTATED",
      actorUserId: rotatedBy,
      actorType: "ADMIN",
      ipAddress,
      eventDetails: {
        new_key_id: newKeyRecord.api_key_id,
        new_key_suffix: generatedKey.keySuffix,
        grace_period_days: gracePeriodDays,
        grace_ends_at: graceEndsAt.toISOString(),
      },
    });

    // Log audit event for new key
    await apiKeyAuditService.logEvent({
      apiKeyId: newKeyRecord.api_key_id,
      eventType: "CREATED",
      actorUserId: rotatedBy,
      actorType: "ADMIN",
      ipAddress,
      eventDetails: {
        rotated_from_key_id: apiKeyId,
        rotated_from_key_suffix: oldKeyRecord.key_suffix,
      },
    });

    return {
      key: generatedKey,
      record: this.mapToApiKeyRecord(newKeyRecord),
    };
  }

  // ==========================================================================
  // Key Activation
  // ==========================================================================

  /**
   * Activate an API key on a device
   *
   * Changes status from PENDING to ACTIVE and records device fingerprint.
   */
  async activateApiKey(
    apiKeyId: string,
    deviceFingerprint: string,
    appVersion: string,
    ipAddress?: string,
  ): Promise<void> {
    const keyRecord = await prisma.apiKey.findUnique({
      where: { api_key_id: apiKeyId },
    });

    if (!keyRecord) {
      throw new Error(`API key not found: ${apiKeyId}`);
    }

    if (keyRecord.status !== "PENDING") {
      throw new Error(`Key is already ${keyRecord.status.toLowerCase()}`);
    }

    await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: {
        status: "ACTIVE",
        activated_at: new Date(),
        device_fingerprint: deviceFingerprint,
      },
    });

    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType: "ACTIVATED",
      actorType: "DEVICE",
      ipAddress,
      eventDetails: {
        device_fingerprint: deviceFingerprint,
        app_version: appVersion,
      },
    });
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(apiKeyId: string): Promise<void> {
    await prisma.apiKey
      .update({
        where: { api_key_id: apiKeyId },
        data: { last_used_at: new Date() },
      })
      .catch((err: unknown) => {
        // Non-critical - log and continue
        console.error("[ApiKeyService] Failed to update last_used_at:", err);
      });
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Get API key by ID
   */
  async getApiKey(apiKeyId: string): Promise<ApiKeyDetails | null> {
    const record = await prisma.apiKey.findUnique({
      where: { api_key_id: apiKeyId },
      include: {
        store: {
          select: {
            name: true,
            public_id: true,
            timezone: true,
            state: { select: { code: true } },
          },
        },
        company: {
          select: { name: true },
        },
        creator: {
          select: { name: true },
        },
        revoker: {
          select: { name: true },
        },
      },
    });

    if (!record) {
      return null;
    }

    return this.mapToApiKeyDetails(record);
  }

  /**
   * List API keys with filtering and pagination
   */
  async listApiKeys(
    filter: ApiKeyListFilter,
    pagination: ApiKeyPaginationOptions,
  ): Promise<ApiKeyListResponse> {
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 20, 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.ApiKeyWhereInput = {};

    if (filter.storeId) {
      where.store_id = filter.storeId;
    }

    if (filter.companyId) {
      where.company_id = filter.companyId;
    }

    if (filter.status) {
      where.status = filter.status;
    } else {
      // Default: exclude revoked and expired unless explicitly requested
      const excludeStatuses: ApiKeyStatus[] = [];
      if (!filter.includeRevoked) {
        excludeStatuses.push("REVOKED");
      }
      if (!filter.includeExpired) {
        excludeStatuses.push("EXPIRED");
      }
      if (excludeStatuses.length > 0) {
        where.status = { notIn: excludeStatuses };
      }
    }

    if (filter.search) {
      where.OR = [
        { label: { contains: filter.search, mode: "insensitive" } },
        { store: { name: { contains: filter.search, mode: "insensitive" } } },
        {
          store: {
            public_id: { contains: filter.search, mode: "insensitive" },
          },
        },
      ];
    }

    // Build order by
    const orderBy: Prisma.ApiKeyOrderByWithRelationInput = {};
    const sortBy = pagination.sortBy || "createdAt";
    const sortOrder = pagination.sortOrder || "desc";

    switch (sortBy) {
      case "createdAt":
        orderBy.created_at = sortOrder;
        break;
      case "lastUsedAt":
        orderBy.last_used_at = sortOrder;
        break;
      case "storeName":
        orderBy.store = { name: sortOrder };
        break;
      case "status":
        orderBy.status = sortOrder;
        break;
    }

    // Execute queries
    const [items, total] = await Promise.all([
      prisma.apiKey.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          store: { select: { name: true, public_id: true } },
          company: { select: { name: true } },
          creator: { select: { name: true } },
        },
      }),
      prisma.apiKey.count({ where }),
    ]);

    return {
      items: items.map(this.mapToApiKeyListItem),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update API key settings
   */
  async updateApiKey(
    apiKeyId: string,
    input: UpdateApiKeyInput,
    updatedBy: string,
    ipAddress?: string,
  ): Promise<ApiKeyRecord> {
    const record = await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: {
        label: input.label,
        metadata: input.metadata as Prisma.JsonObject,
        ip_allowlist: input.ipAllowlist,
        ip_enforcement_enabled: input.ipEnforcementEnabled,
        rate_limit_rpm: input.rateLimitRpm,
        daily_sync_quota: input.dailySyncQuota,
        monthly_data_quota_mb: input.monthlyDataQuotaMb,
        expires_at: input.expiresAt,
      },
    });

    // Determine what was updated for audit
    const updates: Record<string, unknown> = {};
    if (input.label !== undefined) updates.label = input.label;
    if (input.metadata !== undefined) updates.metadata = "updated";
    if (input.ipAllowlist !== undefined)
      updates.ip_allowlist = input.ipAllowlist;
    if (input.ipEnforcementEnabled !== undefined)
      updates.ip_enforcement = input.ipEnforcementEnabled;
    if (input.rateLimitRpm !== undefined)
      updates.rate_limit_rpm = input.rateLimitRpm;

    const eventType =
      input.metadata !== undefined ? "METADATA_UPDATED" : "SETTINGS_UPDATED";

    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType,
      actorUserId: updatedBy,
      actorType: "ADMIN",
      ipAddress,
      eventDetails: updates,
    });

    return this.mapToApiKeyRecord(record);
  }

  /**
   * Suspend an API key
   */
  async suspendApiKey(
    apiKeyId: string,
    reason: string,
    suspendedBy: string,
    ipAddress?: string,
  ): Promise<void> {
    await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: {
        status: "SUSPENDED",
        revocation_notes: reason,
      },
    });

    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType: "SUSPENDED",
      actorUserId: suspendedBy,
      actorType: "ADMIN",
      ipAddress,
      eventDetails: { reason },
    });
  }

  /**
   * Reactivate a suspended API key
   */
  async reactivateApiKey(
    apiKeyId: string,
    reactivatedBy: string,
    ipAddress?: string,
  ): Promise<void> {
    const record = await prisma.apiKey.findUnique({
      where: { api_key_id: apiKeyId },
    });

    if (!record) {
      throw new Error(`API key not found: ${apiKeyId}`);
    }

    if (record.status !== "SUSPENDED") {
      throw new Error(`Cannot reactivate key with status: ${record.status}`);
    }

    await prisma.apiKey.update({
      where: { api_key_id: apiKeyId },
      data: {
        status: "ACTIVE",
        revocation_notes: null,
      },
    });

    await apiKeyAuditService.logEvent({
      apiKeyId,
      eventType: "REACTIVATED",
      actorUserId: reactivatedBy,
      actorType: "ADMIN",
      ipAddress,
    });
  }

  // ==========================================================================
  // Mapping Helpers
  // ==========================================================================

  private mapToApiKeyRecord(record: unknown): ApiKeyRecord {
    const r = record as {
      api_key_id: string;
      store_id: string;
      company_id: string;
      key_prefix: string;
      key_hash: string;
      key_suffix: string;
      label: string | null;
      identity_payload: string;
      payload_version: number;
      metadata: Prisma.JsonValue;
      ip_allowlist: string[];
      ip_enforcement_enabled: boolean;
      rate_limit_rpm: number;
      daily_sync_quota: number;
      monthly_data_quota_mb: number;
      status: ApiKeyStatus;
      activated_at: Date | null;
      expires_at: Date | null;
      last_used_at: Date | null;
      last_sync_at: Date | null;
      device_fingerprint: string | null;
      revoked_at: Date | null;
      revoked_by: string | null;
      revocation_reason: string | null;
      revocation_notes: string | null;
      rotated_from_key_id: string | null;
      rotation_grace_ends_at: Date | null;
      created_at: Date;
      updated_at: Date;
      created_by: string;
    };

    return {
      apiKeyId: r.api_key_id,
      storeId: r.store_id,
      companyId: r.company_id,
      keyPrefix: r.key_prefix,
      keyHash: r.key_hash,
      keySuffix: r.key_suffix,
      label: r.label,
      identityPayload: r.identity_payload,
      payloadVersion: r.payload_version,
      metadata: r.metadata as ApiKeyMetadata | null,
      ipAllowlist: r.ip_allowlist,
      ipEnforcementEnabled: r.ip_enforcement_enabled,
      rateLimitRpm: r.rate_limit_rpm,
      dailySyncQuota: r.daily_sync_quota,
      monthlyDataQuotaMb: r.monthly_data_quota_mb,
      status: r.status,
      activatedAt: r.activated_at,
      expiresAt: r.expires_at,
      lastUsedAt: r.last_used_at,
      lastSyncAt: r.last_sync_at,
      deviceFingerprint: r.device_fingerprint,
      revokedAt: r.revoked_at,
      revokedBy: r.revoked_by,
      revocationReason: r.revocation_reason as ApiKeyRecord["revocationReason"],
      revocationNotes: r.revocation_notes,
      rotatedFromKeyId: r.rotated_from_key_id,
      rotationGraceEndsAt: r.rotation_grace_ends_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by,
    };
  }

  private mapToApiKeyListItem(record: {
    api_key_id: string;
    store_id: string;
    company_id: string;
    key_prefix: string;
    key_suffix: string;
    label: string | null;
    status: ApiKeyStatus;
    activated_at: Date | null;
    last_used_at: Date | null;
    last_sync_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
    store: { name: string; public_id: string };
    company: { name: string };
    creator: { name: string };
  }): ApiKeyListItem {
    return {
      apiKeyId: record.api_key_id,
      storeId: record.store_id,
      storeName: record.store.name,
      storePublicId: record.store.public_id,
      companyId: record.company_id,
      companyName: record.company.name,
      keyPrefix: record.key_prefix,
      keySuffix: record.key_suffix,
      label: record.label,
      status: record.status,
      activatedAt: record.activated_at,
      lastUsedAt: record.last_used_at,
      lastSyncAt: record.last_sync_at,
      expiresAt: record.expires_at,
      createdAt: record.created_at,
      createdByName: record.creator.name,
    };
  }

  private mapToApiKeyDetails(record: {
    api_key_id: string;
    store_id: string;
    company_id: string;
    key_prefix: string;
    key_suffix: string;
    label: string | null;
    metadata: Prisma.JsonValue;
    ip_allowlist: string[];
    ip_enforcement_enabled: boolean;
    rate_limit_rpm: number;
    daily_sync_quota: number;
    monthly_data_quota_mb: number;
    status: ApiKeyStatus;
    activated_at: Date | null;
    last_used_at: Date | null;
    last_sync_at: Date | null;
    expires_at: Date | null;
    device_fingerprint: string | null;
    rotated_from_key_id: string | null;
    rotation_grace_ends_at: Date | null;
    revoked_at: Date | null;
    revoked_by: string | null;
    revocation_reason: string | null;
    revocation_notes: string | null;
    created_at: Date;
    store: {
      name: string;
      public_id: string;
      timezone: string;
      state: { code: string } | null;
    };
    company: { name: string };
    creator: { name: string };
    revoker: { name: string } | null;
  }): ApiKeyDetails {
    return {
      apiKeyId: record.api_key_id,
      storeId: record.store_id,
      storeName: record.store.name,
      storePublicId: record.store.public_id,
      companyId: record.company_id,
      companyName: record.company.name,
      keyPrefix: record.key_prefix,
      keySuffix: record.key_suffix,
      label: record.label,
      metadata: record.metadata as ApiKeyMetadata | null,
      ipAllowlist: record.ip_allowlist,
      ipEnforcementEnabled: record.ip_enforcement_enabled,
      rateLimitRpm: record.rate_limit_rpm,
      dailySyncQuota: record.daily_sync_quota,
      monthlyDataQuotaMb: record.monthly_data_quota_mb,
      status: record.status,
      activatedAt: record.activated_at,
      lastUsedAt: record.last_used_at,
      lastSyncAt: record.last_sync_at,
      expiresAt: record.expires_at,
      deviceFingerprint: record.device_fingerprint,
      rotatedFromKeyId: record.rotated_from_key_id,
      rotationGraceEndsAt: record.rotation_grace_ends_at,
      revokedAt: record.revoked_at,
      revokedBy: record.revoked_by,
      revokedByName: record.revoker?.name || null,
      revocationReason:
        record.revocation_reason as ApiKeyDetails["revocationReason"],
      revocationNotes: record.revocation_notes,
      createdAt: record.created_at,
      createdByName: record.creator.name,
      timezone: record.store.timezone,
      stateCode: record.store.state?.code || null,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const apiKeyService = new ApiKeyService();
