"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LiveChatWidgetSettingsForm } from "@/components/settings/live-chat-widget-form";
import { ChatWidgetPreview } from "@/components/live-chat/chat-widget-preview";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { LiveChatWidgetSettings } from "@/lib/types";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle } from "lucide-react";

const DEFAULT_WIDGET_SETTINGS: LiveChatWidgetSettings = {
  widgetEnabled: true,
  primaryColor: "#29ABE2",
  welcomeMessage: "¡Hola! ¿En qué podemos ayudarte hoy?",
  chatHeaderText: "Chatea con Nosotros",
  widgetPosition: "bottom-right",
};

export default function LiveChatWidgetSettingsPage() {
  const [settings, setSettings] = useState<LiveChatWidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const settingsDocRef = doc(db, "settings", "liveChatWidgetConfiguration");
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data() as LiveChatWidgetSettings);
        } else {
          setSettings(DEFAULT_WIDGET_SETTINGS); // Set defaults if not found
        }
      } catch (error) {
        console.error("Error fetching live chat widget settings:", error);
        toast({
          title: "Error al Cargar Configuración",
          description: "No se pudo cargar la configuración del widget de chat.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [toast]);

  const handleSettingsSaved = (newSettings: LiveChatWidgetSettings) => {
    setSettings(newSettings);
  };
  
  // Placeholder for a more dynamic script generation
  const embedScript = `
<script>
  (function() {
    // This is a placeholder for the actual widget loading script.
    // In a real scenario, this would load a JS bundle for the chat widget.
    console.log("CRM Rápido Live Chat Widget Loader Initialized");
    
    // Widget settings would be passed here or fetched by the widget script
    window.CRMRapidoChatSettings = ${JSON.stringify(settings, null, 2)};

    // Example: Create a simple button to represent the widget
    var widgetButton = document.createElement('button');
    widgetButton.id = 'crm-rapido-chat-button';
    widgetButton.innerText = 'Chat';
    widgetButton.style.position = 'fixed';
    widgetButton.style.${settings.widgetPosition === 'bottom-right' ? 'right' : 'left'} = '20px';
    widgetButton.style.bottom = '20px';
    widgetButton.style.padding = '10px 15px';
    widgetButton.style.backgroundColor = '${settings.primaryColor}';
    widgetButton.style.color = 'white';
    widgetButton.style.border = 'none';
    widgetButton.style.borderRadius = '50px';
    widgetButton.style.cursor = 'pointer';
    widgetButton.style.zIndex = '9999';
    widgetButton.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    widgetButton.onclick = function() { alert('Chat iniciado (simulado) con mensaje: ${settings.welcomeMessage.replace(/'/g, "\\'")}') };
    
    if (${settings.widgetEnabled}) {
      document.body.appendChild(widgetButton);
    }

    // The actual widget JS (e.g., loaded from your CRM domain) would handle:
    // - Creating the chat interface
    // - Connecting to Firebase for real-time messaging
    // - Displaying the welcome message, header, etc.
  })();
</script>
  `.trim();


  return (
    <div className="flex flex-col gap-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
            <MessageCircle className="h-7 w-7 text-primary" />
            Configuración del Widget de Chat en Vivo
          </CardTitle>
          <CardDescription>
            Personaliza cómo se ve y se comporta el widget de chat en tu sitio web.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Ajustes del Widget</CardTitle>
              <CardDescription>
                Modifica la apariencia y los mensajes predeterminados del widget.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-6">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-10 w-1/2" />
                </div>
              ) : (
                <LiveChatWidgetSettingsForm
                  currentSettings={settings}
                  onSettingsSaved={handleSettingsSaved}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vista Previa del Widget</CardTitle>
              <CardDescription>Así se verá el widget con la configuración actual.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <ChatWidgetPreview settings={settings} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Script de Incrustación</CardTitle>
              <CardDescription>
                Copia y pega este código en las páginas de tu sitio web donde quieras mostrar el chat.
                Colócalo justo antes de la etiqueta de cierre `&lt;/body&gt;`.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="embed-script" className="sr-only">Script de Incrustación</Label>
              <Textarea
                id="embed-script"
                readOnly
                value={embedScript}
                className="h-48 font-mono text-xs bg-muted"
                rows={10}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Nota: La funcionalidad completa del chat en vivo y las notificaciones a agentes están en desarrollo.
                Este script es un ejemplo básico y se actualizará a medida que se implementen más características.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
