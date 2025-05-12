
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { Smile } from "lucide-react";

export default function SatisfactionSurveysPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/satisfaction-surveys');
  const PageIcon = navItem?.icon || Smile;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Encuestas de Satisfacción"}
          </CardTitle>
          <CardDescription>
            Mide la satisfacción de tus clientes (CSAT/NPS) enviando encuestas después de la resolución de tickets o interacciones clave.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Diseñador de encuestas (CSAT, NPS, preguntas personalizadas).</li>
                <li>Envío automático de encuestas tras cierre de ticket o eventos específicos.</li>
                <li>Recopilación y visualización de respuestas.</li>
                <li>Cálculo de métricas CSAT y NPS.</li>
                <li>Informes de tendencias de satisfacción.</li>
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
