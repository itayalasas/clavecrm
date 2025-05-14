// src/components/layout/app-sidebar.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { APP_NAME, NAV_ITEMS, type NavItem, APP_ICON } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings, ChevronDown, Briefcase } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getUserInitials } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state: sidebarState } = useSidebar();
  const { currentUser, logout } = useAuth();
  const { toast } = useToast();
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

  const IconComponent = APP_ICON; 

  const handleLogout = async () => {
    try {
      await logout();
      toast({ title: "Sesión Cerrada", description: "Has cerrado sesión exitosamente." });
      router.push('/login');
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      toast({ title: "Error", description: "No se pudo cerrar la sesión.", variant: "destructive" });
    }
  };
  
  const toggleSubmenu = (label: string) => {
    setOpenSubmenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // Determine if a parent item should be active
  const isParentActive = (item: NavItem) => {
    if (item.parentActiveIf) return item.parentActiveIf(pathname);
    return item.subItems?.some(subItem => subItem.href && pathname.startsWith(subItem.href)) || false;
  };
  
  // Pre-calculate open states for submenus based on active child items
  React.useEffect(() => {
    const newOpenSubmenus: Record<string, boolean> = {};
    NAV_ITEMS.forEach(item => {
      if (item.subItems && isParentActive(item)) {
        newOpenSubmenus[item.label] = true;
      }
    });
    setOpenSubmenus(prev => ({...prev, ...newOpenSubmenus}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // Only re-run when pathname changes

  return (
    <Sidebar
      variant="sidebar" 
      collapsible={sidebarState === "collapsed" ? "icon" : "offcanvas"} 
      className="border-r"
    >
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <IconComponent className="h-8 w-8 text-primary flex-shrink-0" />
          {sidebarState === "expanded" && (
            <h1 className="text-xl font-semibold truncate">{APP_NAME}</h1>
          )}
        </Link>
      </SidebarHeader>
      <Separator />
      <SidebarContent className="flex-grow p-2">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.label}>
              {item.subItems ? (
                <>
                  <SidebarMenuButton
                    onClick={() => toggleSubmenu(item.label)}
                    isActive={isParentActive(item)}
                    className={cn(
                      "justify-between w-full", 
                      sidebarState === "collapsed" && "justify-center"
                    )}
                    tooltip={item.label}
                  >
                    <div className="flex items-center gap-2 min-w-0"> {/* Added min-w-0 */}
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {sidebarState === "expanded" && <span className="truncate">{item.label}</span>} {/* Added truncate */}
                    </div>
                    {sidebarState === "expanded" && (
                      <ChevronDown className={cn("h-4 w-4 transition-transform flex-shrink-0", openSubmenus[item.label] ? "rotate-180" : "")} />
                    )}
                  </SidebarMenuButton>
                  {sidebarState === "expanded" && openSubmenus[item.label] && (
                    <SidebarMenuSub>
                      {item.subItems.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.href}>
                           <Link href={subItem.href || "#"} passHref legacyBehavior>
                            <SidebarMenuSubButton
                                asChild
                                isActive={subItem.href ? pathname.startsWith(subItem.href) : false}
                            >
                                <a>
                                    <subItem.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                                    <span className="truncate">{subItem.label}</span> {/* Added truncate */}
                                </a>
                            </SidebarMenuSubButton>
                           </Link>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </>
              ) : (
                <Link href={item.href || "#"} passHref legacyBehavior>
                  <SidebarMenuButton
                    asChild
                    isActive={item.href ? pathname.startsWith(item.href) : false}
                    className={cn(
                      sidebarState === "collapsed" && "justify-center"
                    )}
                    tooltip={item.label}
                  >
                    <a>
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {sidebarState === "expanded" && <span className="truncate">{item.label}</span>} {/* Added truncate */}
                    </a>
                  </SidebarMenuButton>
                </Link>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <Separator />
      <SidebarFooter className="p-4">
        {currentUser ? (
          sidebarState === 'expanded' ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage src={currentUser.avatarUrl || `https://avatar.vercel.sh/${currentUser.email}.png`} alt={currentUser.name || "Usuario"} data-ai-hint="user avatar" />
                <AvatarFallback>{getUserInitials(currentUser.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0"> {/* Added min-w-0 for truncation */}
                <p className="text-sm font-medium truncate">{currentUser.name || "Usuario"}</p>
                <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto flex-shrink-0" title="Cerrar Sesión" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
               <Avatar className="h-10 w-10">
                  <AvatarImage src={currentUser.avatarUrl || `https://avatar.vercel.sh/${currentUser.email}.png`} alt={currentUser.name || "Usuario"} data-ai-hint="user avatar" />
                  <AvatarFallback>{getUserInitials(currentUser.name)}</AvatarFallback>
                </Avatar>
              <Button variant="ghost" size="icon" title="Configuración" onClick={() => router.push('/settings')}>
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" title="Cerrar Sesión" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          )
        ) : (
           sidebarState === 'expanded' && (
            <Button onClick={() => router.push('/login')} className="w-full">
                Iniciar Sesión
            </Button>
           )
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
