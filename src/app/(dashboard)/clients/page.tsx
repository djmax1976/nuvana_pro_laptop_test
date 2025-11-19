"use client";

import { ClientList } from "@/components/clients/ClientList";

/**
 * Clients page
 * Displays list of clients (System Admin only)
 * Route protection should be handled by middleware
 */
export default function ClientsPage() {
  return <ClientList />;
}
