"use client";

import * as React from "react";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

const SIDEBAR_WIDTH = "calc(var(--spacing) * 72)";

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return (
    <div
      className="flex flex-col flex-1 min-h-svh transition-[margin-left] duration-200 ease-linear"
      style={{ marginLeft: open ? SIDEBAR_WIDTH : "0px" }}
    >
      <SiteHeader />
      <div className="flex flex-col flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

export function AppLayout({
  user,
  onSignOut,
  children,
}: {
  user: { name: string; email: string; avatar?: string };
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": SIDEBAR_WIDTH,
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar user={user} onSignOut={onSignOut} />
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarProvider>
  );
}
