"use client";

import { useAuth } from "@/lib/auth/auth-provider";
import { AppSidebar } from "./app-sidebar";
import { CreateSection } from "./create-section";
import { SiteHeader } from "./site-header";
import {
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

const SIDEBAR_WIDTH = "calc(var(--spacing) * 72)";

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return (
    <div
      className="flex flex-col flex-1 min-h-svh transition-[margin-left] duration-200 ease-linear"
      style={{ marginLeft: open ? SIDEBAR_WIDTH : "0px" }}
    >
      {children}
    </div>
  );
}

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
          "--sidebar-width": SIDEBAR_WIDTH,
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar user={displayUser} onSignOut={signOut} />
      <DashboardLayout>
        <SiteHeader />
        <div className="flex flex-1 min-h-0">
          <div className="w-1/2 min-w-0 flex flex-col">
            <CreateSection />
          </div>
          <div className="w-1/2 min-w-0" />
        </div>
      </DashboardLayout>
    </SidebarProvider>
  );
}
