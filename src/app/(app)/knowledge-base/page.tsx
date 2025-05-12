
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { Brain } from "lucide-react";

export default function KnowledgeBasePage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/knowledge-base');
  const PageIcon = navItem?.icon || Brain;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Base de Conocimiento"}
          </CardTitle>
          <CardDescription>
            Crea y gestiona artículos de ayuda internos y/o públicos para mejorar el autoservicio y la eficiencia del soporte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Creación y edición de artículos con formato enriquecido.</li>
                <li>Organización por categorías y etiquetas.</li>
                <li>Búsqueda potente de artículos.</li>
                <li>Control de visibilidad (interno/público).</li>
                <li>Sistema de valoración y comentarios de artículos.</li>
                <li>Vinculación de artículos a tickets de soporte.</li>
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
