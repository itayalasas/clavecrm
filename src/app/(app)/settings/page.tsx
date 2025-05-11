
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { Settings, Mail, Share2Icon } from "lucide-react";

export default function SettingsPage() {
  const navItem = NAV_ITEMS.find(item => item.href === '/settings');
  const PageIcon = navItem?.icon || Settings;

  return (
    <div className="flex flex-col gap-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
            <PageIcon className="h-7 w-7 text-primary" />
            {navItem?.label || "Configuración del Sistema"}
          </CardTitle>
          <CardDescription>
            Administra la configuración global de tu CRM, integraciones y personalizaciones.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Mail className="h-5 w-5 text-primary" />
              Configuración de Correo Electrónico
            </CardTitle>
            <CardDescription>
              Configura los ajustes de tu servidor de correo para el envío de campañas, notificaciones y correos transaccionales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Esta sección te permitirá ingresar detalles como:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm pl-4">
                <li>Servidor SMTP (Host, Puerto, Seguridad)</li>
                <li>Credenciales de Autenticación</li>
                <li>Dirección de Remitente Predeterminada</li>
                <li>Configuración de Límites de Envío</li>
              </ul>
              <p className="mt-4 text-sm font-semibold text-accent-foreground">
                Funcionalidad en desarrollo. Próximamente podrás configurar estos ajustes aquí.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Share2Icon className="h-5 w-5 text-primary" />
              Integraciones de Redes Sociales
            </CardTitle>
            <CardDescription>
              Conecta tus perfiles de redes sociales para habilitar las funciones de Social CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
               <p className="text-sm text-muted-foreground">
                Aquí podrás autorizar el acceso a:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm pl-4">
                <li>Facebook (Páginas y Mensajería)</li>
                <li>Instagram (Perfiles de Empresa y Mensajería)</li>
                <li>LinkedIn (Perfiles y Páginas de Empresa)</li>
                <li>Twitter / X (Perfiles y Menciones)</li>
              </ul>
              <p className="mt-4 text-sm font-semibold text-accent-foreground">
                Integraciones en desarrollo. Próximamente podrás vincular tus cuentas.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                La disponibilidad y el alcance de las integraciones dependerán de las APIs proporcionadas por cada plataforma de red social.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
       <Card className="mt-2">
          <CardHeader>
            <CardTitle className="text-xl">Otras Configuraciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Futuras configuraciones del sistema, como campos personalizados, roles y permisos detallados, y ajustes de la interfaz, se gestionarán aquí.
            </p>
          </CardContent>
        </Card>
    </div>
  );
}
