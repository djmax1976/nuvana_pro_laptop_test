import { redirect } from "next/navigation";

/**
 * Client Login Page - Redirects to unified login
 *
 * This page exists for backwards compatibility and SEO.
 * All authentication now goes through the unified /login page,
 * which handles role-based redirect after successful authentication.
 *
 * Client users (is_client_user=true) are automatically redirected
 * to /client-dashboard after logging in via /login.
 */
export default function ClientLoginPage() {
  // Server-side redirect to unified login page
  redirect("/login");
}
