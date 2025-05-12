
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { FileClock } from "lucide-react";

export default function ActivityLogPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/activity-log');
  const PageIcon = navItem?.icon || FileClock;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Registro de Actividades"}
          </CardTitle>
          <CardDescription>
            Mantén un historial de todas las interacciones con tus clientes: llamadas, reuniones, correos y notas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Registro manual de actividades (llamadas, visitas, notas).</li>
                <li>Integración con el módulo de correo para registrar emails enviados/recibidos (requiere configuración de email).</li>
                <li>Asociación de actividades a leads, contactos, tickets u oportunidades.</li>
                <li>Filtros y búsqueda avanzada de actividades.</li>
                <li>Visualización cronológica de interacciones por cliente.</li>
                <li><strong>Funcionalidades Avanzadas (Futuro):</strong>
                  <ul className="list-circle list-inside ml-4">
                    <li>Grabación de llamadas (requiere integración con sistema de telefonía).</li>
                    <li>Análisis de sentimiento de correos o transcripciones (requiere IA y puede tener costos adicionales).</li>
                  </ul>
                </li>
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

    