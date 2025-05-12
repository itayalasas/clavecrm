
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { CalendarDays } from "lucide-react";

export default function CalendarPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/calendar');
  const PageIcon = navItem?.icon || CalendarDays;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Calendario y Reuniones"}
          </CardTitle>
          <CardDescription>
            Gestiona tu agenda, programa reuniones, envía invitaciones y recibe recordatorios automáticos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Vista de calendario (mes, semana, día).</li>
                <li>Creación y edición de eventos/reuniones.</li>
                <li>Integración con leads y contactos para invitar asistentes.</li>
                <li>Envío de invitaciones (.ics) y recordatorios por correo electrónico.</li>
                <li>Sincronización con calendarios externos (Google Calendar, Outlook) (funcionalidad avanzada).</li>
                <li>Asignación de salas o recursos para reuniones.</li>
              </ul>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Esta sección está actualmente en desarrollo. Vuelve pronto para ver las actualizaciones.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    