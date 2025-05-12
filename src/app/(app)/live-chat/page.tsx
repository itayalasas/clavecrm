
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/constants";
import { MessagesSquare, Settings2, MessageCircle, Bot, Users, History, PlusCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LiveChatPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/live-chat');
  const PageIcon = navItem?.icon || MessagesSquare;

  const renderFeatureCard = (title: string, Icon: React.ElementType, description: string, features: string[], status: "planeado" | "desarrollo" | "parcial" | "implementado") => {
    let badgeVariant: "default" | "secondary" | "outline" | "destructive" = "outline";
    let badgeText = "Planeado";
    let badgeClass = "border-gray-500 text-gray-600";

    if (status === "implementado") {
      badgeVariant = "default";
      badgeText = "Implementado";
      badgeClass = "bg-green-500 hover:bg-green-600 text-white";
    } else if (status === "parcial") {
      badgeVariant = "default";
      badgeText = "Parcial";
      badgeClass = "bg-yellow-500 hover:bg-yellow-600 text-black";
    } else if (status === "desarrollo") {
      badgeVariant = "outline";
      badgeText = "En Desarrollo";
      badgeClass = "border-blue-500 text-blue-600";
    }


    return (
      <Card className={status === "implementado" ? "bg-green-50 border-green-200" : (status === "parcial" || status === "desarrollo" ? "bg-yellow-50 border-yellow-200" : "bg-muted/30")}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-lg ${status === "implementado" ? 'text-green-700' : (status === "parcial" || status === "desarrollo" ? 'text-yellow-700' : 'text-amber-500')}`}>
            <Icon className="h-5 w-5" />
            {title}
            <Badge variant={badgeVariant} className={`ml-2 text-xs ${badgeClass}`}>{badgeText}</Badge>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            {features.map(f => <li key={f}>{f}</li>)}
          </ul>
        </CardContent>
      </Card>
    );
  }


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
          <p className="text-center text-muted-foreground py-8">
            Esta sección está actualmente en desarrollo. Vuelve pronto para ver las actualizaciones y funcionalidades.
          </p>
        </CardContent>
      </Card>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        {renderFeatureCard(
          "Widget de Chat en Vivo",
          MessageCircle,
          "Configura e integra un widget de chat personalizable en tu sitio web.",
          [
            "Personalización básica del widget (colores, mensaje de bienvenida, posición) - Implementado.",
            "Script de incrustación para sitios web (generado, funcionalidad real del chat en desarrollo).",
            "Notificaciones para agentes cuando un usuario inicia un chat (Planeado, requiere backend).",
          ],
          "parcial"
        )}
        {renderFeatureCard(
          "Panel de Agente",
          Users,
          "Interfaz para que los agentes atiendan las conversaciones de chat en tiempo real.",
          [
            "Visualización de chats entrantes y en curso.",
            "Respuestas predefinidas (canned responses).",
            "Información básica del visitante (si está disponible).",
            "Transferencia de chat entre agentes.",
          ],
          "desarrollo"
        )}
        {renderFeatureCard(
          "Historial de Conversaciones",
          History,
          "Almacena y revisa todas las conversaciones de chat.",
          [
            "Listado de conversaciones pasadas.",
            "Búsqueda y filtrado de historial.",
            "Transcripciones de chat.",
          ],
          "planeado"
        )}
        {renderFeatureCard(
          "Integración CRM",
          PlusCircle,
          "Conecta las conversaciones de chat con tu CRM.",
          [
            "Creación de leads desde una conversación de chat.",
            "Creación de tickets de soporte desde un chat.",
            "Vinculación de chats a perfiles de clientes existentes.",
          ],
          "planeado"
        )}
        {renderFeatureCard(
          "Constructor de Chatbot Básico",
          Bot,
          "Crea flujos simples de chatbot para preguntas frecuentes o calificación de leads.",
          [
            "Interfaz para definir preguntas y respuestas.",
            "Opciones de ramificación simple.",
            "Captura de información básica (nombre, email).",
          ],
          "planeado"
        )}
         {renderFeatureCard(
          "Transferencia Bot a Humano",
          Zap,
          "Permite que los chatbots transfieran la conversación a un agente humano cuando sea necesario.",
          [
            "Definir disparadores para la transferencia (ej. palabras clave, opción de usuario).",
            "Notificar a agentes disponibles sobre la transferencia.",
          ],
          "planeado"
        )}
        {renderFeatureCard(
          "Integración con WhatsApp Business API",
          Settings2, 
          "Conecta con la API de WhatsApp Business para gestionar mensajes desde el CRM (funcionalidad avanzada).",
          [
            "Configuración de la conexión con WhatsApp Business API.",
            "Recepción y envío de mensajes de WhatsApp.",
            "Limitado por las políticas y costos de la API de WhatsApp.",
          ],
          "planeado"
        )}
      </div>
    </div>
  );
}

