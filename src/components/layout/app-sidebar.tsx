
"use client";

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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { APP_NAME, NAV_ITEMS, APP_ICON } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { open, setOpen, isMobile, state: sidebarState } = useSidebar();
  const { currentUser, logout } = useAuth();
  const { toast } = useToast();

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
  
  const getUserInitials = (name?: string | null) => {
    if (!name) return "U";
    const nameParts = name.split(" ");
    if (nameParts.length > 1) {
      return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
    }
    return name.substring(0,2).toUpperCase();
  }


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
        {currentUser ? (
          sidebarState === 'expanded' ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentUser.avatarUrl || `https://avatar.vercel.sh/${currentUser.email}.png`} alt={currentUser.name || "Usuario"} data-ai-hint="user avatar" />
                <AvatarFallback>{getUserInitials(currentUser.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium truncate max-w-[120px]">{currentUser.name || "Usuario"}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[120px]">{currentUser.email}</p>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto" title="Cerrar Sesión" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
               <Avatar className="h-10 w-10">
                  <AvatarImage src={currentUser.avatarUrl || `https://avatar.vercel.sh/${currentUser.email}.png`} alt={currentUser.name || "Usuario"} data-ai-hint="user avatar" />
                  <AvatarFallback>{getUserInitials(currentUser.name)}</AvatarFallback>
                </Avatar>
              <Button variant="ghost" size="icon" title="Configuración">
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
