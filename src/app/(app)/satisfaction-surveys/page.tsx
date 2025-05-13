"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { Smile, AlertTriangle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
          <div className="space-y-4 p-6 border rounded-lg bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-lg font-semibold">Funcionalidad en Desarrollo</h3>
            </div>
            <p className="text-sm text-amber-600">
                La creación, envío y análisis de encuestas de satisfacción está planeado y se implementará próximamente.
            </p>
            <div className="mt-3">
                <h4 className="font-medium text-amber-700">Características Planeadas:</h4>
                <ul className="list-disc list-inside text-sm text-amber-600 space-y-1 mt-1">
                    <li>Diseñador de encuestas (CSAT, NPS, preguntas personalizadas).</li>
                    <li>
                        <Send className="inline h-4 w-4 mr-1"/>
                        Envío automático de encuestas tras cierre de ticket o eventos específicos (UI placeholder en tickets implementado).
                    </li>
                    <li>Recopilación y visualización de respuestas.</li>
                    <li>Cálculo de métricas CSAT y NPS.</li>
                    <li>Informes de tendencias de satisfacción.</li>
                </ul>
            </div>
            <Badge variant="outline" className="mt-3 border-amber-500 text-amber-700">Próximamente</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}