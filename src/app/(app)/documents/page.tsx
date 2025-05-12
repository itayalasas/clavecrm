
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { FolderKanban } from "lucide-react";

export default function DocumentsPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/documents');
  const PageIcon = navItem?.icon || FolderKanban;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Gestión de Documentos"}
          </CardTitle>
          <CardDescription>
            Organiza y gestiona todos los documentos relacionados con tus clientes, ventas y proyectos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Carga y almacenamiento seguro de documentos (contratos, propuestas, presentaciones).</li>
                <li>Asociación de documentos a leads, contactos, oportunidades, pedidos, etc.</li>
                <li>Control de versiones de documentos.</li>
                <li>Búsqueda y filtrado de documentos.</li>
                <li>Creación y gestión de plantillas de documentos predefinidas (ej. plantillas de propuestas, contratos).</li>
                <li>Compartir documentos de forma segura con clientes (opcional, con control de permisos).</li>
                <li>Integración con almacenamiento en la nube (ej. Google Drive, Dropbox) (funcionalidad avanzada).</li>
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

    