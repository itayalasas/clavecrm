
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail as MailIcon, Send, Inbox, Edit3, Archive, Trash2, Info, PlusCircle } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { EmailComposer } from "@/components/email/email-composer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { EmailMessage } from "@/lib/types";

// Placeholder data for demonstration
const mockEmails: EmailMessage[] = [
  { id: '1', subject: 'Consulta sobre Producto X', from: { email: 'cliente@example.com', name: 'Cliente Interesado' }, to: [{email: 'currentuser@example.com'}], date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), bodyText: 'Hola, me gustaría saber más sobre...', status: 'received', isRead: false, userId: 'currentUser' },
  { id: '2', subject: 'Re: Presupuesto #123', from: { email: 'currentuser@example.com', name: 'Yo'}, to: [{ email: 'lead@example.com', name: 'Lead Importante' }], date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), bodyText: 'Adjunto el presupuesto actualizado...', status: 'sent', userId: 'currentUser' },
  { id: '3', subject: 'Borrador: Seguimiento Post-Reunión', from: { email: 'currentuser@example.com', name: 'Yo'}, to: [{ email: 'prospecto@example.com' }], date: new Date().toISOString(), bodyText: 'Gracias por la reunión de hoy...', status: 'draft', userId: 'currentUser' },
  { id: '4', subject: '¡Promoción Especial!', from: { email: 'marketing@empresa.com', name: 'Marketing Empresa' }, to: [{email: 'currentuser@example.com'}], date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), bodyText: 'No te pierdas nuestras ofertas...', status: 'received', isRead: true, userId: 'currentUser' },
];

// This new component will handle search params
function EmailPageContent() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = navItem?.icon || MailIcon;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("inbox"); // Default to inbox
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const searchParams = useSearchParams();
  const initialTo = searchParams.get("to") || "";
  const initialSubject = searchParams.get("subject") || "";
  const initialBody = searchParams.get("body") || ""; // Placeholder if we want to prefill body

  useEffect(() => {
    // If 'to' or 'subject' params are present, switch to compose tab
    if (initialTo || initialSubject) {
      setActiveTab("compose");
    }
  }, [initialTo, initialSubject]);


  const handleQueueEmailForSending = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }) => {
    setIsSendingEmail(true);
    console.log("Poniendo en cola correo para:", data);
    try {
      await addDoc(collection(db, "outgoingEmails"), {
        to: data.to,
        cc: data.cc || null,
        bcc: data.bcc || null,
        subject: data.subject,
        bodyHtml: data.body, // Assuming body is HTML
        status: "pending",
        createdAt: serverTimestamp(),
        // TODO: Add fromName and fromEmail based on current user or settings
      });
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


  const renderEmailList = (statusType: 'received' | 'sent' | 'draft' | 'archived') => {
    const filtered = mockEmails.filter(email => email.status === statusType);
    // In a real app, fetch from Firestore based on statusType and userId
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
                  <p className={`font-medium ${!email.isRead && statusType === 'received' ? 'text-primary' : ''}`}>{email.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {statusType === 'received' ? `De: ${email.from?.name || email.from?.email}` : `Para: ${email.to?.map(t => t.name || t.email).join(', ')}`}
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
          <TabsTrigger value="inbox"><Inbox className="mr-2 h-4 w-4" />Bandeja de Entrada</TabsTrigger>
          <TabsTrigger value="compose"><Edit3 className="mr-2 h-4 w-4" />Redactar</TabsTrigger>
          <TabsTrigger value="sent"><Send className="mr-2 h-4 w-4" />Enviados</TabsTrigger>
          <TabsTrigger value="drafts" disabled><Archive className="mr-2 h-4 w-4" />Borradores</TabsTrigger>
          <TabsTrigger value="trash" disabled><Trash2 className="mr-2 h-4 w-4" />Papelera</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="flex-grow mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Bandeja de Entrada</CardTitle>
                <Button onClick={() => setActiveTab("compose")} size="sm">
                    <PlusCircle className="mr-2 h-4 w-4"/> Redactar Nuevo Correo
                </Button>
            </CardHeader>
            <CardContent>{renderEmailList('received')}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compose" className="flex-grow mt-4">
          <EmailComposer
            key={initialTo + initialSubject + initialBody} // Re-render if these change
            initialTo={initialTo}
            initialSubject={decodeURIComponent(initialSubject)} // Decode subject
            initialBody={decodeURIComponent(initialBody)}
            onSend={handleQueueEmailForSending}
            isSending={isSendingEmail}
          />
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
            <strong className="text-amber-800">Redacción y Envío (Frontend a Backend):</strong> <span className="font-semibold text-green-600">Implementado.</span> El botón "Enviar" ahora crea un documento en `outgoingEmails` para ser procesado por la Cloud Function `sendSingleEmail`.
          </p>
          <p>
            <strong className="text-amber-800">Envío Real de Correos (Backend):</strong> <span className="font-semibold text-green-600">Implementado (Vía Cloud Function `sendSingleEmail`).</span> Requiere configuración SMTP funcional en Firestore.
          </p>
          <p>
            <strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización):</strong> <span className="font-semibold text-red-600">Pendiente (Backend Muy Complejo).</span> Implica integración con IMAP o APIs de proveedores de correo. Actualmente muestra datos de ejemplo.
          </p>
           <p>
            <strong className="text-amber-800">Gestión de Carpetas (Enviados, Borradores, Papelera):</strong> Actualmente muestra datos de ejemplo. Funcionalidad real (ej. listar enviados desde `outgoingEmails`) pendiente.
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

