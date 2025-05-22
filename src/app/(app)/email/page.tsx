
"use client";

import { useState, useEffect, Suspense } from "react"; // Added Suspense
import { useSearchParams } from "next/navigation"; // Import useSearchParams
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail as MailIcon, Send, Inbox, Edit3, Archive, Trash2, Info } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { EmailComposer } from "@/components/email/email-composer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton"; // For Suspense fallback

// Placeholder data for demonstration
const mockEmails = [
  { id: '1', subject: 'Consulta sobre Producto X', from: { email: 'cliente@example.com', name: 'Cliente Interesado' }, date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), bodyText: 'Hola, me gustaría saber más sobre...', status: 'received', isRead: false },
  { id: '2', subject: 'Re: Presupuesto #123', to: [{ email: 'lead@example.com', name: 'Lead Importante' }], date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), bodyText: 'Adjunto el presupuesto actualizado...', status: 'sent' },
  { id: '3', subject: 'Borrador: Seguimiento Post-Reunión', to: [{ email: 'prospecto@example.com' }], date: new Date().toISOString(), bodyText: 'Gracias por la reunión de hoy...', status: 'draft' },
];

// This new component will handle search params
function EmailPageContent() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = navItem?.icon || MailIcon;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("compose");
  const [isSendingEmail, setIsSendingEmail] = useState(false); // For button loading state

  const searchParams = useSearchParams();
  const initialTo = searchParams.get("to") || "";
  const initialSubject = searchParams.get("subject") || "";
  const leadName = searchParams.get("leadName") || "";


  const handleQueueEmailForSending = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }) => {
    setIsSendingEmail(true);
    console.log("Poniendo en cola correo para:", data);
    try {
      // Firestore logic to add to 'outgoingEmails' collection
      // This part would typically be in a service or directly here
      // For now, just simulate success
      // import { db } from '@/lib/firebase';
      // import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
      // await addDoc(collection(db, "outgoingEmails"), {
      //   ...data,
      //   status: "pending",
      //   createdAt: serverTimestamp(),
      // });
      toast({
        title: "Correo en Cola para Envío",
        description: `Tu correo para ${data.to} ha sido puesto en cola y se enviará pronto.`,
      });
      setActiveTab("sent"); // Switch to sent tab after "sending"
    } catch (error) {
      console.error("Error al poner correo en cola:", error);
      toast({
        title: "Error al Enviar Correo",
        description: "No se pudo poner el correo en cola para envío.",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };


  const renderEmailList = (status: 'received' | 'sent' | 'draft' | 'archived') => {
    const filtered = mockEmails.filter(email => email.status === status);
    if (filtered.length === 0) {
      return <p className="text-muted-foreground text-center py-8">No hay correos en esta carpeta.</p>;
    }
    return (
      <div className="space-y-2">
        {filtered.map(email => (
          <Card key={email.id} className="hover:shadow-md cursor-pointer">
            <CardContent className="p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className={`font-medium ${!email.isRead && status === 'received' ? 'text-primary' : ''}`}>{email.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {status === 'received' ? `De: ${email.from?.name || email.from?.email}` : `Para: ${email.to?.map(t => t.name || t.email).join(', ')}`}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap">{new Date(email.date).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <Card className="shadow-lg shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Correo Electrónico"}
          </CardTitle>
          <CardDescription>
            Gestiona tus comunicaciones por correo electrónico directamente desde el CRM.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 shrink-0">
          <TabsTrigger value="compose"><Edit3 className="mr-2 h-4 w-4" />Redactar</TabsTrigger>
          <TabsTrigger value="inbox"><Inbox className="mr-2 h-4 w-4" />Bandeja de Entrada</TabsTrigger>
          <TabsTrigger value="sent"><Send className="mr-2 h-4 w-4" />Enviados</TabsTrigger>
          <TabsTrigger value="drafts" disabled><Archive className="mr-2 h-4 w-4" />Borradores</TabsTrigger>
          <TabsTrigger value="trash" disabled><Trash2 className="mr-2 h-4 w-4" />Papelera</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="flex-grow mt-4">
          <EmailComposer
            key={initialTo + initialSubject} // Re-render if these change
            initialTo={initialTo}
            initialSubject={decodeURIComponent(initialSubject)} // Decode subject
            onSend={handleQueueEmailForSending}
            isSending={isSendingEmail}
          />
        </TabsContent>
        <TabsContent value="inbox" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Bandeja de Entrada</CardTitle></CardHeader>
            <CardContent>{renderEmailList('received')}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="sent" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Correos Enviados</CardTitle></CardHeader>
            <CardContent>{renderEmailList('sent')}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="drafts" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Borradores</CardTitle></CardHeader>
            <CardContent>{renderEmailList('draft')}</CardContent>
          </Card>
        </TabsContent>
         <TabsContent value="trash" className="flex-grow mt-4">
           <Card><CardHeader><CardTitle>Papelera</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground text-center py-8">Funcionalidad de papelera en desarrollo.</p></CardContent>
           </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-4 bg-amber-50 border-amber-200 shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center text-amber-700 text-lg gap-2">
            <Info className="h-5 w-5" />
            Estado de Desarrollo del Módulo de Correo
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600 space-y-2">
          <p>
            <strong className="text-amber-800">Interfaz de Composición:</strong> Implementada. El botón "Enviar" ahora crea un documento en `outgoingEmails` para ser procesado por una Cloud Function.
          </p>
          <p>
            <strong className="text-amber-800">Envío Real de Correos:</strong> <span className="font-semibold text-orange-600">Backend Pendiente</span>. Requiere una Cloud Function `sendSingleEmail` que lea de `outgoingEmails` y use la configuración SMTP.
          </p>
          <p>
            <strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización):</strong> <span className="font-semibold text-red-600">Pendiente (Backend Muy Complejo).</span> Implica integración con IMAP o APIs de proveedores de correo.
          </p>
           <p>
            <strong className="text-amber-800">Gestión de Carpetas (Enviados, Borradores, Papelera):</strong> Listas de ejemplo. Funcionalidad real depende de la recepción y envío.
          </p>
          <p>
            <strong className="text-amber-800">Vinculación a Tickets/Leads:</strong> <span className="font-semibold text-orange-600">Planeado.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Main component to ensure useSearchParams is used within Suspense boundary
export default function EmailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-full w-full" />}>
      <EmailPageContent />
    </Suspense>
  );
}
