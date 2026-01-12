"use client";

import { ApiKeyList } from "@/components/admin/ApiKeyList";

/**
 * API Keys Management Page
 * Displays all API keys for desktop application connections (SUPERADMIN only)
 *
 * This page allows superadmins to:
 * - View all API keys across all stores
 * - Create new API keys for stores
 * - Rotate, suspend, and revoke keys
 * - View key details and audit trails
 *
 * @security SUPERADMIN only - stores have no access to API key management
 */
export default function ApiKeysPage() {
  return (
    <div className="container mx-auto py-6">
      <ApiKeyList />
    </div>
  );
}
