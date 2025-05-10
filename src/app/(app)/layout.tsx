"use client"; // This layout uses client-side hooks from SidebarProvider

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}> {/* Manage sidebar state */}
      <AppSidebar />
      <SidebarInset> {/* Main content area that adjusts to sidebar */}
        <AppHeader />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
