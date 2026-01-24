"use client";

import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

// Mark as dynamic to prevent prerendering
export const dynamic = "force-dynamic";

function LoginContent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
      <LoginForm />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
          Loading...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
