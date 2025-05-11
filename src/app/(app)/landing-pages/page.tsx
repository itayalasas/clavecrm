
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { LayoutTemplate } from "lucide-react";

export default function LandingPagesPage() {
  const navItem = NAV_ITEMS.find(item => item.href === '/landing-pages');
  const PageIcon = navItem?.icon || LayoutTemplate;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Landing Pages y Formularios"}
          </CardTitle>
          <CardDescription>
            Diseña landing pages y formularios web para capturar leads directamente en tu CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Constructor de landing pages (arrastrar y soltar).</li>
                <li>Plantillas personalizables para landing pages.</li>
                <li>Creador de formularios web integrados.</li>
                <li>Mapeo de campos de formulario a campos de lead en el CRM.</li>
                <li>Opciones de incrustación de formularios en sitios externos.</li>
                <li>Analíticas de conversión de landing pages y formularios.</li>
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
