"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { ClockIcon, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function EscalationRulesPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || []).find(item => item.href === '/settings/escalation-rules');
  const PageIcon = navItem?.icon || ClockIcon;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            Reglas de Escalado de Tickets
          </CardTitle>
          <CardDescription>
            Define reglas para escalar tickets automáticamente si no se cumplen los SLAs o permanecen inactivos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 p-6 border rounded-lg bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">Funcionalidad en Desarrollo</h3>
            </div>
            <p className="text-sm text-amber-600">
              La gestión completa de reglas de escalado (creación, edición, y lógica de ejecución en backend) está planeada y se implementará próximamente.
            </p>
            <div className="mt-3">
              <h4 className="font-medium text-amber-700">Características Planeadas:</h4>
              <ul className="list-disc list-inside text-sm text-amber-600 space-y-1 mt-1">
                <li>Definición de condiciones de escalado (ej. tiempo de inactividad, incumplimiento de SLA).</li>
                <li>Configuración de acciones automáticas (ej. notificar supervisor, cambiar prioridad, reasignar).</li>
                <li>Ordenamiento y priorización de reglas.</li>
                <li>Logs de escalados ejecutados.</li>
              </ul>
            </div>
            <Badge variant="outline" className="mt-3 border-amber-500 text-amber-700">Próximamente</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}