
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { MessagesSquare } from "lucide-react";

export default function LiveChatPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/live-chat');
  const PageIcon = navItem?.icon || MessagesSquare;

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Chat en Vivo y Chatbots"}
          </CardTitle>
          <CardDescription>
            Integra un widget de chat en vivo en tu sitio web y/o configura chatbots para respuestas rápidas y captura de leads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Próximas Funcionalidades:</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
                <li>Configuración de widget de chat en vivo personalizable.</li>
                <li>Integración con WhatsApp Business API (funcionalidad avanzada).</li>
                <li>Panel de agente para atender chats en tiempo real.</li>
                <li>Historial de conversaciones de chat.</li>
                <li>Creación de leads o tickets desde conversaciones de chat.</li>
                <li>Constructor básico de flujos de chatbot para preguntas frecuentes.</li>
                <li>Transferencia de chat de bot a agente humano.</li>
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
