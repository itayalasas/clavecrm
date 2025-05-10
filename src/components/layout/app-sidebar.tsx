"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { APP_NAME, NAV_ITEMS, APP_ICON } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const { open, setOpen, isMobile, state: sidebarState } = useSidebar();

  const IconComponent = APP_ICON;

  return (
    <Sidebar
      variant="sidebar" 
      collapsible={isMobile ? "offcanvas" : "icon"}
      className="border-r"
    >
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <IconComponent className="h-8 w-8 text-primary" />
          {sidebarState === "expanded" && (
            <h1 className="text-xl font-semibold">{APP_NAME}</h1>
          )}
        </Link>
      </SidebarHeader>
      <Separator />
      <SidebarContent className="flex-grow p-2">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref legacyBehavior>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(item.href)}
                  className={cn(
                    "justify-start",
                    sidebarState === "collapsed" && "justify-center"
                  )}
                  tooltip={item.label}
                >
                  <a>
                    <item.icon className="h-5 w-5" />
                    {sidebarState === "expanded" && <span>{item.label}</span>}
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <Separator />
      <SidebarFooter className="p-4">
        {sidebarState === 'expanded' ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="https://picsum.photos/id/237/200/200" alt="User Avatar" data-ai-hint="user avatar" />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">Usuario Demo</p>
              <p className="text-xs text-muted-foreground">usuario@ejemplo.com</p>
            </div>
            <Button variant="ghost" size="icon" className="ml-auto" title="Cerrar Sesión">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
             <Avatar className="h-10 w-10">
                <AvatarImage src="https://picsum.photos/id/237/200/200" alt="User Avatar" data-ai-hint="user avatar" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            <Button variant="ghost" size="icon" title="Configuración">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" title="Cerrar Sesión">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
