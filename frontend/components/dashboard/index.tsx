"use client";

import { useAuth } from "@/lib/auth/auth-provider";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

/**
 * Dashboard view. When logged in, shows sidebar and header. Wallets UI opens from sidebar "Wallets" button.
 */
export function Dashboard() {
  const { user, signOut } = useAuth();
  const displayUser = {
    name: user?.user_metadata?.full_name ?? user?.email ?? "User",
    email: user?.email ?? "",
    avatar: user?.user_metadata?.avatar_url,
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar user={displayUser} onSignOut={signOut} variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col" />
      </SidebarInset>
    </SidebarProvider>
  );
}
