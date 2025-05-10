"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";

export function AppHeader() {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  
  const currentPage = NAV_ITEMS.find(item => pathname.startsWith(item.href));
  const pageTitle = currentPage ? currentPage.label : "MiniCRM Express";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
      {isMobile && <SidebarTrigger />}
      {!isMobile && <div className="w-8 h-8"></div>} {/* Placeholder to align title when desktop sidebar is collapsed */}
      
      <h1 className="text-xl font-semibold hidden md:block">{pageTitle}</h1>
      
      <div className="ml-auto flex items-center gap-4">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Search..." className="pl-8 sm:w-[300px] md:w-[200px] lg:w-[300px] rounded-full" />
        </div>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Bell className="h-5 w-5" />
          <span className="sr-only">Notifications</span>
        </Button>
      </div>
    </header>
  );
}
