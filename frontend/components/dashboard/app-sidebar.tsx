"use client";

import * as React from "react";
import {
  IconCamera,
  IconChartBar,
  IconHierarchy2,
  IconDatabase,
  IconFileAi,
  IconFileDescription,
  IconFileWord,
  IconFolder,
  IconHelp,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
  IconWallet,
  IconBuilding,
  IconGitBranch,
  IconBuildingBank,
  IconFileStack,
} from "@tabler/icons-react";

import { NavDocuments } from "@/components/dashboard/nav-documents";
import { NavMain } from "@/components/dashboard/nav-main";
import { NavSecondary } from "@/components/dashboard/nav-secondary";
import { NavUser } from "@/components/dashboard/nav-user";
import { OrganizationsSection } from "@/components/dashboard/organizations-section";
import { WalletsSection } from "@/components/dashboard/wallets-section";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function AppSidebar({
  user,
  onSignOut,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar?: string };
  onSignOut?: () => void;
}) {
  const [walletsOpen, setWalletsOpen] = React.useState(false);
  const [orgsOpen, setOrgsOpen] = React.useState(false);
  const data = {
    user,
    navMain: [
      {
        title: "Hierarchy",
        url: "/dashboard/hierarchy",
        icon: IconHierarchy2,
      },
      {
        title: "Bank Profiles",
        url: "/dashboard/bank-profiles",
        icon: IconBuildingBank,
      },
      {
        title: "Workflows",
        url: "/dashboard/workflows",
        icon: IconGitBranch,
      },
      {
        title: "Documents",
        url: "/dashboard/documents",
        icon: IconFileStack,
      },
      {
        title: "Lifecycle",
        url: "#",
        icon: IconListDetails,
      },
      {
        title: "Analytics",
        url: "#",
        icon: IconChartBar,
      },
      {
        title: "Projects",
        url: "#",
        icon: IconFolder,
      },
      {
        title: "Team",
        url: "#",
        icon: IconUsers,
      },
    ],
    navClouds: [
      {
        title: "Capture",
        icon: IconCamera,
        isActive: true,
        url: "#",
        items: [
          {
            title: "Active Proposals",
            url: "#",
          },
          {
            title: "Archived",
            url: "#",
          },
        ],
      },
      {
        title: "Proposal",
        icon: IconFileDescription,
        url: "#",
        items: [
          {
            title: "Active Proposals",
            url: "#",
          },
          {
            title: "Archived",
            url: "#",
          },
        ],
      },
      {
        title: "Prompts",
        icon: IconFileAi,
        url: "#",
        items: [
          {
            title: "Active Proposals",
            url: "#",
          },
          {
            title: "Archived",
            url: "#",
          },
        ],
      },
    ],
    navSecondary: [
      {
        title: "Settings",
        url: "#",
        icon: IconSettings,
      },
      {
        title: "Get Help",
        url: "#",
        icon: IconHelp,
      },
      {
        title: "Search",
        url: "#",
        icon: IconSearch,
      },
    ],
    documents: [
      {
        name: "Data Library",
        url: "#",
        icon: IconDatabase,
      },
      {
        name: "Reports",
        url: "#",
        icon: IconReport,
      },
      {
        name: "Word Assistant",
        url: "#",
        icon: IconFileWord,
      },
    ],
  };

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
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setWalletsOpen(true)}>
                  <IconWallet />
                  <span>Wallets</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setOrgsOpen(true)}>
                  <IconBuilding />
                  <span>Organizations</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} onSignOut={onSignOut} />
      </SidebarFooter>

      <Sheet open={walletsOpen} onOpenChange={setWalletsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Wallets</SheetTitle></SheetHeader>
          <div className="mt-6"><WalletsSection showHeading={false} /></div>
        </SheetContent>
      </Sheet>

      <Sheet open={orgsOpen} onOpenChange={setOrgsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Organizations</SheetTitle></SheetHeader>
          <div className="mt-6"><OrganizationsSection showHeading={false} /></div>
        </SheetContent>
      </Sheet>
    </Sidebar>
  );
}
