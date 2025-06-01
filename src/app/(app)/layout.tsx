
"use client";

import { useAuth } from "@/contexts/auth-context";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header"; 
import { Toaster } from "@/components/ui/toaster";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldAlert, KeyRound, ExternalLink, Settings, XCircle, LogIn } from "lucide-react"; 
import { Skeleton } from "@/components/ui/skeleton";
// CAMBIADO: Importar SidebarProvider desde la ubicación correcta (componentes UI)
import { SidebarProvider } from "@/components/ui/sidebar"; 

function LicenseAccessDeniedBlock({ status, isAdmin, forBaseDomain }: { status: string, isAdmin: boolean, forBaseDomain?: boolean }) {
  let title = "Acceso Denegado por Licencia";
  let message = "Tu licencia no es válida, ha expirado, se ha excedido el límite de usuarios, o no está configurada.";
  let IconComponent = AlertTriangle;

  if (forBaseDomain) {
    title = "Acceso al Dominio Principal";
    message = "Por favor, accede a través de la URL específica de tu tenant (ej. sunombre.tudominio.com) para iniciar sesión y usar la aplicación.";
    IconComponent = LogIn;
  } else {
    switch (status) {
      case 'expired': title = "Licencia Expirada"; message = "Tu licencia ha expirado."; IconComponent = ShieldAlert; break;
      case 'no_license': title = "Licencia No Encontrada"; message = "No se encontró una licencia para tu tenant."; IconComponent = KeyRound; break;
      case 'limit_reached': title = "Límite de Usuarios Excedido"; message = "Se ha excedido el límite de usuarios."; IconComponent = AlertTriangle; break;
      case 'not_configured': title = "Tenant No Configurado o Sin Licencia"; message = "El tenant no está configurado correctamente o no tiene licencia."; IconComponent = Settings; break;
      case 'cancelled': title = "Licencia Cancelada"; message = "La licencia ha sido cancelada."; IconComponent = XCircle; break;
      default: IconComponent = AlertTriangle; break;
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <IconComponent className={`mx-auto h-16 w-16 mb-4 ${forBaseDomain ? 'text-primary' : 'text-destructive'}`} />
          <CardTitle className={`text-2xl font-bold ${forBaseDomain ? 'text-primary' : 'text-destructive'}`}>{title}</CardTitle>
          <CardDescription className="text-md mt-2">{message}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {isAdmin && !forBaseDomain && (
            <>
              <p className="text-sm text-muted-foreground mb-4">Como administrador, puedes gestionar la licencia.</p>
              <Button asChild variant="default" size="lg"><Link href="/settings/license"><KeyRound className="mr-2 h-5 w-5" /> Ir a Configuración de Licencia</Link></Button>
            </>
          )}
          {!isAdmin && !forBaseDomain && (
            <p className="text-sm text-muted-foreground">Contacta al administrador de tu sistema.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Asegúrate de obtener hasPermission de useAuth
  const { currentUser, effectiveLicenseStatus, loading, isUserDataLoaded, hasPermission } = useAuth();
  const pathname = usePathname();
  
  // Determina si el usuario es admin BASADO EN PERMISOS
  const userCanManageLicense = currentUser ? hasPermission('gestionar-licencia') : false;

  // Y usa esta nueva variable
  const isAdminOnLicensePage = userCanManageLicense && pathname === '/settings/license';

  console.log("AppLayout: loading:", loading, "isUserDataLoaded:", isUserDataLoaded, "currentUser:", !!currentUser, "effectiveLicenseStatus:", effectiveLicenseStatus, "pathname:", pathname, "userCanManageLicense:", userCanManageLicense);

  if (loading || !isUserDataLoaded) {
    console.log("AppLayout: Mostrando Skeleton Loader (carga inicial)");
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4"><Skeleton className="h-12 w-12 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-[250px]" /><Skeleton className="h-4 w-[200px]" /></div></div>
      </div>
    );
  }

  if (!currentUser && isUserDataLoaded) {
    console.log("AppLayout: No currentUser y datos cargados. Status Licencia:", effectiveLicenseStatus, ". Mostrando bloqueo para dominio base o no logueado.");
    // Para el bloqueo de dominio base, isAdmin es siempre false ya que no hay usuario.
    return <LicenseAccessDeniedBlock status={effectiveLicenseStatus} isAdmin={false} forBaseDomain={true} />;
  }

  const hasLicenseProblem = effectiveLicenseStatus !== 'active' && effectiveLicenseStatus !== 'trial' && effectiveLicenseStatus !== 'pending';
  if (currentUser && hasLicenseProblem && !isAdminOnLicensePage) {
    console.log("AppLayout: currentUser existe, hay problema de licencia y no es admin en pág. licencia. Bloqueando.");
    // Pasa userCanManageLicense a isAdmin
    return <LicenseAccessDeniedBlock status={effectiveLicenseStatus} isAdmin={userCanManageLicense} />;
  }
  
  console.log("AppLayout: Renderizando contenido normal de la aplicación.");
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background">
        {currentUser && <AppSidebar />} 
        <div className="flex flex-1 flex-col">
          {currentUser && <AppHeader />} 
          <main className={`w-full flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 ${!currentUser ? 'h-screen flex items-center justify-center' : ''}`}>
            {children}
          </main>
        </div>
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
