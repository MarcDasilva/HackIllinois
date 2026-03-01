"use client";

import * as React from "react";
import { IconNetwork } from "@tabler/icons-react";

import { NavMain } from "@/components/dashboard/nav-main";
import { NavUser } from "@/components/dashboard/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function AppSidebar({
  user,
  onSignOut,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar?: string };
  onSignOut?: () => void;
}) {
  const navItems = [
    {
      title: "Workflows",
      url: "/dashboard/workflows",
      icon: IconNetwork,
    },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarRail />
      <SidebarHeader className="p-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <a
              href="/dashboard"
              className="block font-serif font-bold tracking-tight outline-none ring-sidebar-ring focus-visible:ring-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground min-h-8 pt-1 pb-0 pl-4"
              style={{ color: "#b8a060", fontSize: "3.5rem" }}
            >
              Velum
            </a>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} onSignOut={onSignOut} />
      </SidebarFooter>
    </Sidebar>
  );
}
