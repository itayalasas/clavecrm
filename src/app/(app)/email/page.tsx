
"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail as MailIcon, Send, Inbox, Edit3, Archive, Trash2, Info, PlusCircle, Loader2, Clock } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { EmailComposer } from "@/components/email/email-composer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import type { EmailMessage } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO } from "date-fns";

// Placeholder data for demonstration (Bandeja de Entrada / Borradores / Papelera)
const mockEmails: EmailMessage[] = [
  { id: '1', subject: 'Consulta sobre Producto X', from: { email: 'cliente@example.com', name: 'Cliente Interesado' }, to: [{email: 'currentuser@example.com'}], date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), bodyText: 'Hola, me gustaría saber más sobre...', status: 'received', isRead: false, userId: 'currentUser' },
  { id: '3', subject: 'Borrador: Seguimiento Post-Reunión', from: { email: 'currentuser@example.com', name: 'Yo'}, to: [{ email: 'prospecto@example.com' }], date: new Date().toISOString(), bodyText: 'Gracias por la reunión de hoy...', status: 'draft', userId: 'currentUser' },
  { id: '4', subject: '¡Promoción Especial!', from: { email: 'marketing@empresa.com', name: 'Marketing Empresa' }, to: [{email: 'currentuser@example.com'}], date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), bodyText: 'No te pierdas nuestras ofertas...', status: 'received', isRead: true, userId: 'currentUser' },
];

function EmailPageContent() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = navItem?.icon || MailIcon;
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("inbox");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now());
  const [composerInitialTo, setComposerInitialTo] = useState("");
  const [composerInitialSubject, setComposerInitialSubject] = useState("");
  const [composerInitialBody, setComposerInitialBody] = useState("");
  const [composerOpenedByButton, setComposerOpenedByButton] = useState(false);

  const [sentEmails, setSentEmails] = useState<EmailMessage[]>([]);
  const [draftEmails, setDraftEmails] = useState<EmailMessage[]>([]);
  const [pendingEmails, setPendingEmails] = useState<EmailMessage[]>([]); // New state for pending emails
  const [isLoadingSent, setIsLoadingSent] = useState(true);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(true); // New loading state

  const searchParams = useSearchParams();

  const handleOpenComposer = useCallback((initialData: { to?: string, subject?: string, body?: string } = {}, openedByBtn = false) => {
    setComposerInitialTo(initialData.to || "");
    setComposerInitialSubject(decodeURIComponent(initialData.subject || ""));
    setComposerInitialBody(decodeURIComponent(initialData.body || ""));
    setComposerKey(Date.now());
    setShowComposer(true);
    setComposerOpenedByButton(openedByBtn);
  }, []);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    if (!composerOpenedByButton && (searchParams.get("to") || searchParams.get("subject"))) {
        router.replace('/email', { scroll: false });
    }
  }, [composerOpenedByButton, searchParams, router]);

  useEffect(() => {
    const toParam = searchParams.get("to");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");

    if (toParam || subjectParam || bodyParam) { // Include bodyParam here
      handleOpenComposer({ to: toParam || "", subject: subjectParam || "", body: bodyParam || "" }, false);
    } else {
        if (showComposer && !composerOpenedByButton) {
             // setShowComposer(false); // Removed to prevent premature closing
        }
    }
  }, [searchParams, handleOpenComposer, showComposer, composerOpenedByButton]);

  const handleQueueEmailForSending = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión para enviar correos.", variant: "destructive"});
        return false;
    }
    setIsSubmittingEmail(true);
    try {
      await addDoc(collection(db, "outgoingEmails"), {
        to: data.to,
        cc: data.cc || null,
        bcc: data.bcc || null,
        subject: data.subject,
        bodyHtml: data.body,
        status: "pending", // Initial status
        createdAt: serverTimestamp(),
        userId: currentUser.id,
        fromName: currentUser.name || "Usuario CRM",
        fromEmail: currentUser.email,
      });
      toast({
        title: "Correo en Cola para Envío",
        description: `Tu correo para ${data.to} ha sido puesto en cola y se enviará pronto.`,
      });
      return true;
    } catch (error) {
      console.error("Error al poner correo en cola:", error);
      toast({
        title: "Error al Enviar Correo",
        description: "No se pudo poner el correo en cola para envío.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSubmittingEmail(false);
    }
  };
  
  const handleEmailQueued = () => {
      handleCloseComposer();
      setActiveTab("pending"); // Change to pending tab after queuing
  };

  const mapFirestoreDocToEmailMessage = (doc: any, currentUserId: string | null, defaultFromName: string | null, defaultFromEmail: string | null): EmailMessage => {
    const data = doc.data();
    let mailDate = new Date(0).toISOString();
    if (data.status === 'sent' && data.sentAt) {
        if (data.sentAt instanceof Timestamp) mailDate = data.sentAt.toDate().toISOString();
        else if (typeof data.sentAt === 'string' && isValid(parseISO(data.sentAt))) mailDate = data.sentAt;
    } else if (data.createdAt) {
        if (data.createdAt instanceof Timestamp) mailDate = data.createdAt.toDate().toISOString();
        else if (typeof data.createdAt === 'string' && isValid(parseISO(data.createdAt))) mailDate = data.createdAt;
    }

    return {
        id: doc.id,
        subject: typeof data.subject === 'string' ? data.subject : "Sin Asunto",
        to: typeof data.to === 'string'
            ? [{ email: data.to }]
            : (Array.isArray(data.to)
                ? data.to.map((t: any) => (typeof t === 'string' ? { email: t } : (t && typeof t.email === 'string' ? t : { email: 'desconocido' })))
                : [{ email: 'desconocido' }]),
        from: { email: data.fromEmail || defaultFromEmail || "sistema@crm.com", name: data.fromName || defaultFromName || "Sistema CRM" },
        cc: typeof data.cc === 'string' ? data.cc.split(',').map(e => ({ email: e.trim() })) : [],
        bcc: typeof data.bcc === 'string' ? data.bcc.split(',').map(e => ({ email: e.trim() })) : [],
        date: mailDate,
        bodyHtml: typeof data.bodyHtml === 'string' ? data.bodyHtml : "",
        bodyText: typeof data.bodyHtml === 'string' ? data.bodyHtml.substring(0, 100) + "..." : "Cuerpo vacío",
        status: data.status as EmailMessage['status'],
        userId: typeof data.userId === 'string' ? data.userId : (currentUserId || "unknown_user"),
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        isRead: typeof data.isRead === 'boolean' ? data.isRead : false, // Default to false
        labels: Array.isArray(data.labels) ? data.labels : [],
    };
  };

  // Fetch Sent Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'sent') {
        setIsLoadingSent(false);
        setSentEmails([]);
        return;
    }
    setIsLoadingSent(true);
    const q = query(
        collection(db, "outgoingEmails"), 
        where("userId", "==", currentUser.id),
        where("status", "==", "sent"), 
        orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, currentUser.name, currentUser.email));
        console.log("Mapped sent emails for UI:", fetched);
        setSentEmails(fetched);
        setIsLoadingSent(false);
    }, (error) => {
        console.error("Error fetching sent emails:", error);
        toast({ title: "Error al cargar enviados", variant: "destructive", description: error.message });
        setIsLoadingSent(false);
        setSentEmails([]);
    });
    return () => unsubscribe();
  }, [currentUser, activeTab, toast]);

  // Fetch Pending Emails (New)
  useEffect(() => {
    if (!currentUser || activeTab !== 'pending') {
        setIsLoadingPending(false);
        setPendingEmails([]);
        return;
    }
    setIsLoadingPending(true);
    const q = query(
        collection(db, "outgoingEmails"),
        where("userId", "==", currentUser.id),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, currentUser.name, currentUser.email));
        setPendingEmails(fetched);
        setIsLoadingPending(false);
    }, (error) => {
        console.error("Error fetching pending emails:", error);
        toast({ title: "Error al cargar correos en cola", variant: "destructive", description: error.message });
        setIsLoadingPending(false);
        setPendingEmails([]);
    });
    return () => unsubscribe();
  }, [currentUser, activeTab, toast]);


  // Fetch Draft Emails (Placeholder)
   useEffect(() => {
    if (!currentUser || activeTab !== 'drafts') {
        setIsLoadingDrafts(false);
        setDraftEmails([]); // Clear if not on drafts tab
        return;
    }
    setIsLoadingDrafts(true);
    // TODO: Implement fetching from a 'drafts' collection or 'outgoingEmails' with status 'draft'
    setDraftEmails(mockEmails.filter(e => e.status === 'draft' && e.userId === 'currentUser')); // Simulate for current user
    setIsLoadingDrafts(false);
  }, [currentUser, activeTab]);


  const renderEmailList = (emailList: EmailMessage[], statusType: EmailMessage['status'], isLoadingList: boolean) => {
    if (isLoadingList) {
        return <Skeleton className="h-40 w-full" />;
    }
    if (emailList.length === 0) {
      return <p className="text-muted-foreground text-center py-8">No hay correos en esta carpeta.</p>;
    }
    return (
      <div className="space-y-2">
        {emailList.map(email => (
          <Card key={email.id} className="hover:shadow-md cursor-pointer">
            <CardContent className="p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className={`font-medium ${!email.isRead && statusType === 'received' ? 'text-primary' : ''}`}>{email.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {statusType === 'received' ? `De: ${email.from?.name || email.from?.email}` : `Para: ${email.to?.map(t => t.name || t.email).join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                    {statusType === 'pending' && <Clock className="h-3 w-3 text-amber-500 animate-pulse" title="En cola para envío"/>}
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{new Date(email.date).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if (showComposer) {
    return (
        <div className="flex flex-col h-full">
            <EmailComposer
                key={composerKey}
                initialTo={composerInitialTo}
                initialSubject={composerInitialSubject}
                initialBody={composerInitialBody}
                onSend={async (data) => {
                    const success = await handleQueueEmailForSending(data);
                    if (success) {
                        handleEmailQueued(); // This will close composer and set active tab
                    }
                }}
                isSending={isSubmittingEmail}
                onClose={handleCloseComposer}
            />
        </div>
    );
  }

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
          <TabsTrigger value="pending"><Clock className="mr-2 h-4 w-4" />Enviando</TabsTrigger>
          <TabsTrigger value="sent"><Send className="mr-2 h-4 w-4" />Enviados</TabsTrigger>
          <TabsTrigger value="drafts"><Archive className="mr-2 h-4 w-4" />Borradores</TabsTrigger>
          <TabsTrigger value="trash" disabled><Trash2 className="mr-2 h-4 w-4" />Papelera</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="flex-grow mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Bandeja de Entrada</CardTitle>
                <Button onClick={() => handleOpenComposer({}, true)} size="sm">
                    <PlusCircle className="mr-2 h-4 w-4"/> Redactar Nuevo Correo
                </Button>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground text-center py-8">Funcionalidad de bandeja de entrada (recepción) en desarrollo avanzado. Requiere integración IMAP/API con proveedor de correo.</p>
                {/* {renderEmailList(mockEmails.filter(e => e.status === 'received'), 'received', false)} */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Correos en Cola de Envío</CardTitle></CardHeader>
            <CardContent>{renderEmailList(pendingEmails, 'pending', isLoadingPending)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Correos Enviados</CardTitle></CardHeader>
            <CardContent>{renderEmailList(sentEmails, 'sent', isLoadingSent)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drafts" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Borradores</CardTitle></CardHeader>
            <CardContent>{renderEmailList(draftEmails, 'draft', isLoadingDrafts)}</CardContent>
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
            <strong className="text-amber-800">Redacción y Puesta en Cola para Envío:</strong> <span className="font-semibold text-green-600">Implementado.</span> Los correos se guardan en `outgoingEmails` para ser procesados por la Cloud Function `sendSingleEmail`.
          </p>
          <p>
            <strong className="text-amber-800">Visualización de Correos en Cola ("Enviando"):</strong> <span className="font-semibold text-green-600">Implementado.</span> Muestra correos con estado 'pending'.
          </p>
          <p>
            <strong className="text-amber-800">Envío Real de Correos (Backend):</strong> <span className="font-semibold text-green-600">Implementado (Vía Cloud Function `sendSingleEmail`).</span> Requiere configuración SMTP funcional en Firestore.
          </p>
          <p>
            <strong className="text-amber-800">Listado de Correos Enviados:</strong> <span className="font-semibold text-green-600">Implementado.</span> Lee de `outgoingEmails` con estado 'sent'.
          </p>
          <p>
            <strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización):</strong> <span className="font-semibold text-red-600">Pendiente (Backend Muy Complejo).</span> Implica integración con IMAP o APIs de proveedores de correo. Actualmente muestra datos de ejemplo.
          </p>
           <p>
            <strong className="text-amber-800">Gestión de Borradores:</strong> <span className="font-semibold text-orange-600">Planeado.</span> (La UI está, pero falta lógica de guardado/carga en `outgoingEmails` con status 'draft').
          </p>
          <p>
            <strong className="text-amber-800">Vinculación a Tickets/Leads:</strong> <span className="font-semibold text-orange-600">Planeado.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-full w-full" />}>
      <EmailPageContent />
    </Suspense>
  );
}

