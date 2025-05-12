"use client";

import type { ChatSession } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle, Link as LinkIcon } from "lucide-react";

interface VisitorInfoProps {
  session: ChatSession | null;
}

export function VisitorInfo({ session }: VisitorInfoProps) {
  if (!session) {
    return (
      <Card className="h-1/2">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-sm flex items-center gap-1">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            Información del Visitante
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 text-xs text-muted-foreground">
          Selecciona un chat para ver la información del visitante.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-1/2">
      <CardHeader className="p-2 pb-1">
        <CardTitle className="text-sm flex items-center gap-1">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            Información del Visitante
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 text-xs space-y-1">
        <p><strong>ID:</strong> <span className="text-muted-foreground">{session.visitorId.substring(0,12)}...</span></p>
        {session.visitorName && <p><strong>Nombre:</strong> <span className="text-muted-foreground">{session.visitorName}</span></p>}
        {session.currentPageUrl && (
            <div className="flex items-start gap-1">
                <strong>Página:</strong>
                <a 
                    href={session.currentPageUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-primary hover:underline truncate text-muted-foreground"
                    title={session.currentPageUrl}
                >
                    <LinkIcon className="inline h-3 w-3 mr-0.5"/>{session.currentPageUrl}
                </a>
            </div>
        )}
        <p className="text-muted-foreground pt-2">Más detalles (ej. historial de chat, ubicación) se mostrarán aquí próximamente.</p>
      </CardContent>
    </Card>
  );
}
