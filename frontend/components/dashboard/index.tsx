"use client";

import { useAuth } from "@/lib/auth/auth-provider";
import { AppLayout } from "./app-layout";
import { CreateSection } from "./create-section";
import { FileStorageSection } from "./file-storage-section";
import { WalletHistorySection } from "./wallet-history-section";

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
    <AppLayout user={displayUser} onSignOut={signOut}>
      <div className="flex flex-1 min-h-0">
        {/* Left: wallet/org selectors + upload */}
        <div className="w-2/5 min-w-0 flex flex-col">
          <CreateSection />
        </div>
        {/* Middle: wallet transaction history */}
        <div className="w-1/4 min-w-0 flex flex-col">
          <WalletHistorySection />
        </div>
        {/* Right: folder/file storage */}
        <div className="w-[35%] min-w-0 flex flex-col">
          <FileStorageSection />
        </div>
      </div>
    </AppLayout>
  );
}
