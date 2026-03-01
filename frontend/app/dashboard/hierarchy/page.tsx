"use client";

import { useAuth } from "@/lib/auth/auth-provider";
import { AppLayout } from "@/components/dashboard/app-layout";
import { HierarchyView } from "@/components/dashboard/hierarchy-view";

export default function HierarchyPage() {
  const { user, signOut } = useAuth();
  const displayUser = {
    name: user?.user_metadata?.full_name ?? user?.email ?? "User",
    email: user?.email ?? "",
    avatar: user?.user_metadata?.avatar_url,
  };

  return (
    <AppLayout user={displayUser} onSignOut={signOut}>
      <HierarchyView />
    </AppLayout>
  );
}
