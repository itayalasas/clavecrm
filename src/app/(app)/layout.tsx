
"use client"; 

import * as React from 'react'; // Ensure React is imported for React.ReactNode
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

// 
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authContext = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authContext.loading && !authContext.currentUser) {
      router.push('/login');
    }
  }, [authContext.currentUser, authContext.loading, router]);

  if (authContext.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="space-y-4 p-8">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
          <p className="text-sm text-muted-foreground">Cargando y verificando licencia...</p>
        </div>
      </div>
    );
  }

  if (!authContext.currentUser) {
    return null; 
  }

  // License Check and Blocking UI
  if (authContext.effectiveLicenseStatus !== 'valid') {
    const isAdminOnLicensePage = 
      authContext.currentUser?.role === 'admin' && 
      pathname === '/settings/license';

    if (!isAdminOnLicensePage) {
      let title = "Acceso Denegado por Licencia";
      let description = "Tu licencia no es válida, ha expirado, se ha excedido el límite de usuarios, o no está configurada.";
      let details = "Por favor, contacta al administrador del sistema para resolver este problema.";

      switch (authContext.effectiveLicenseStatus) {
        case 'expired':
          description = "La licencia de la aplicación ha expirado.";
          details = "Por favor, renueva tu licencia o contacta al administrador.";
          break;
        case 'user_limit_exceeded':
          description = "Se ha excedido el número máximo de usuarios permitidos por tu licencia.";
          details = "Contacta al administrador para actualizar tu plan de licencia.";
          break;
        case 'invalid_key':
          description = "La clave de licencia ingresada no es válida.";
          details = "Verifica la clave o contacta al administrador.";
          break;
        case 'mismatched_project_id':
          description = "La clave de licencia es válida, pero para un proyecto diferente.";
          details = "Asegúrate de estar usando la clave correcta para este proyecto o contacta al administrador.";
          break;
        case 'api_error':
          description = "Hubo un error al verificar el estado de la licencia con el servidor.";
          details = "Intenta de nuevo más tarde o contacta al soporte técnico.";
          break;
        case 'not_configured':
          description = "La licencia de la aplicación no ha sido configurada.";
          details = "Un administrador debe ingresar una clave de licencia válida en la sección de configuración.";
          break;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md shadow-lg border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-6 w-6" /> {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p>{details}</p>
              {authContext.currentUser?.role === 'admin' && (
                 <p className="mt-4 text-sm">
                    Puedes gestionar la licencia en <Link href="/settings/license" className="text-primary underline hover:text-primary/80">Configuración de Licencia</Link>.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }
  }


  return (
    <SidebarProvider defaultOpen={true}> 
      <AppSidebar />
      <SidebarInset> 
        <AppHeader />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
