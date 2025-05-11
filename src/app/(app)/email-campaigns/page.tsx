"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { Send } from "lucide-react"; // Default icon if specific one not found or item is missing

export default function EmailCampaignsPage() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email-campaigns');
  const PageIcon = navItem?.icon || Send;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Campañas de Email Marketing"}
          </CardTitle>
          <CardDescription>
            Gestiona tus campañas de email marketing, segmenta listas, envía correos masivos y utiliza plantillas personalizables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Creación y gestión de listas de contactos.</li>
                <li>Editor de plantillas de correo (arrastrar y soltar o HTML).</li>
                <li>Programación y envío de campañas masivas.</li>
                <li>Segmentación avanzada de audiencias.</li>
                <li>Analíticas de campañas (aperturas, clics, etc.).</li>
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