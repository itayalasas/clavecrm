
"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail as MailIcon, Send, Inbox, Archive, Trash2, Info, PlusCircle, Loader2, Clock } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { EmailComposer } from "@/components/email/email-composer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import type { EmailMessage, OutgoingEmail } from "@/lib/types"; // Added OutgoingEmail
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO } from "date-fns";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 10;

// Helper to parse various date formats from Firestore to ISO string
const parseFirestoreDateToISO = (fieldValue: any): string | undefined => {
    if (!fieldValue) return undefined;
    if (fieldValue instanceof Timestamp) {
        return fieldValue.toDate().toISOString();
    }
    if (typeof fieldValue === 'string') {
        const parsedDate = parseISO(fieldValue);
        if (isValid(parsedDate)) {
            return parsedDate.toISOString();
        }
    }
    console.warn("Invalid date format received from Firestore for email:", fieldValue);
    return undefined;
};


function EmailPageContent() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = navItem?.icon || MailIcon;
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"inbox" | "pending" | "sent" | "drafts" | "trash">("inbox");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now());
  const [composerInitialTo, setComposerInitialTo] = useState("");
  const [composerInitialSubject, setComposerInitialSubject] = useState("");
  const [composerInitialBody, setComposerInitialBody] = useState("");
  const [composerOpenedByButton, setComposerOpenedByButton] = useState(false);

  const [sentEmails, setSentEmails] = useState<EmailMessage[]>([]);
  const [draftEmails, setDraftEmails] = useState<EmailMessage[]>([]); // Placeholder for now
  const [pendingEmails, setPendingEmails] = useState<EmailMessage[]>([]);
  const [inboxEmails, setInboxEmails] = useState<EmailMessage[]>([]);

  const [isLoadingSent, setIsLoadingSent] = useState(true);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true); // Placeholder
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);

  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [currentPageInbox, setCurrentPageInbox] = useState(1);
  const [currentPageSent, setCurrentPageSent] = useState(1);
  const [currentPagePending, setCurrentPagePending] = useState(1);
  const [currentPageDrafts, setCurrentPageDrafts] = useState(1);

  const handleOpenComposer = useCallback((initialData: { to?: string, subject?: string, body?: string } = {}, openedByBtn = false) => {
    setSelectedEmail(null);
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
        const current = new URLSearchParams(Array.from(searchParams.entries()));
        current.delete('to');
        current.delete('subject');
        current.delete('body');
        router.replace(`/email?${current.toString()}`, { scroll: false });
    }
  }, [composerOpenedByButton, searchParams, router]);

  const handleViewEmail = (email: EmailMessage) => {
    setSelectedEmail(email);
    setShowComposer(false); // Close composer if open
  };

  const handleCloseEmailView = () => {
    setSelectedEmail(null);
  };

  useEffect(() => {
    const toParam = searchParams.get("to");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId");

    if (emailIdParam) {
      // This logic needs to be more robust for fetching a specific email if not already loaded
      const findEmail = (id: string, list: EmailMessage[]) => list.find(e => e.id === id);
      let emailToView = findEmail(emailIdParam, sentEmails) ||
                        findEmail(emailIdParam, pendingEmails) ||
                        findEmail(emailIdParam, inboxEmails) ||
                        findEmail(emailIdParam, draftEmails);

      if (emailToView) {
        handleViewEmail(emailToView);
      } else {
        // Maybe fetch the specific email here if not found in current lists
        console.warn(`Email with ID ${emailIdParam} not found in loaded lists.`);
        // toast({ title: "Correo no encontrado", description: `No se pudo cargar el correo con ID: ${emailIdParam}`, variant: "destructive"});
      }
    } else if (toParam || subjectParam || bodyParam) {
      handleOpenComposer({ to: toParam || "", subject: subjectParam || "", body: bodyParam || "" }, false);
    }
  }, [searchParams, handleOpenComposer, sentEmails, pendingEmails, inboxEmails, draftEmails, toast]);


  const handleQueueEmailForSending = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión para enviar correos.", variant: "destructive"});
        return false;
    }
    setIsSubmittingEmail(true);
    try {
      const emailDoc: Omit<OutgoingEmail, 'id' | 'createdAt' | 'sentAt' | 'errorMessage'> = {
        to: data.to,
        cc: data.cc || null,
        bcc: data.bcc || null,
        subject: data.subject,
        bodyHtml: data.body,
        status: "pending",
        userId: currentUser.id,
        fromName: currentUser.name || "Usuario CRM", // Or use a configured default sender name
        fromEmail: currentUser.email, // Or use a configured default sender email
      };
      await addDoc(collection(db, "outgoingEmails"), {
        ...emailDoc,
        createdAt: serverTimestamp(),
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
      setActiveTab("pending");
  };
  
  // Helper to map Firestore doc data to EmailMessage for UI display
  const mapFirestoreDocToEmailMessage = useCallback((docSnap: any, currentUserId: string | null): EmailMessage => {
    const data = docSnap.data();
    
    let mailDate = parseFirestoreDateToISO(data.sentAt) || parseFirestoreDateToISO(data.receivedAt) || parseFirestoreDateToISO(data.createdAt) || new Date(0).toISOString();

    // Parse 'from' and 'to' which might be simple strings from IMAP or objects
    let fromField = { email: 'desconocido@sistema.com', name: 'Sistema' };
    if (typeof data.from === 'string') {
        fromField = { email: data.from };
    } else if (data.from && typeof data.from.email === 'string') {
        fromField = data.from;
    } else if (data.fromEmail) { // For outgoing emails
        fromField = { email: data.fromEmail, name: data.fromName };
    }


    let toField: { name?: string; email: string }[] = [{ email: 'desconocido' }];
    if (typeof data.to === 'string') {
        toField = data.to.split(',').map(e => ({ email: e.trim() }));
    } else if (Array.isArray(data.to)) {
        toField = data.to.map((t: any) => (typeof t === 'string' ? { email: t } : (t && typeof t.email === 'string' ? t : { email: 'desconocido' })));
    }

    return {
        id: docSnap.id,
        subject: typeof data.subject === 'string' ? data.subject : "Sin Asunto",
        from: fromField,
        to: toField,
        cc: typeof data.cc === 'string' ? data.cc.split(',').map(e => ({ email: e.trim() })) : (Array.isArray(data.cc) ? data.cc.map(c => typeof c === 'string' ? {email: c} : c) : []),
        bcc: typeof data.bcc === 'string' ? data.bcc.split(',').map(e => ({ email: e.trim() })) : (Array.isArray(data.bcc) ? data.bcc.map(b => typeof b === 'string' ? {email: b} : b): []),
        date: mailDate,
        receivedAt: parseFirestoreDateToISO(data.receivedAt),
        bodyHtml: typeof data.html === 'string' ? data.html : (typeof data.bodyHtml === 'string' ? data.bodyHtml : ""),
        bodyText: typeof data.text === 'string' ? data.text : (typeof data.bodyHtml === 'string' ? data.bodyHtml.replace(/<[^>]+>/g, '').substring(0, 150) + "..." : ""),
        status: data.status as EmailMessage['status'] || 'received', // Default to received for incoming
        userId: typeof data.userId === 'string' ? data.userId : (currentUserId || "unknown_user"),
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        isRead: typeof data.isRead === 'boolean' ? data.isRead : (data.status === 'sent' || data.status === 'pending'), 
        labels: Array.isArray(data.labels) ? data.labels : [],
    };
  }, []);

  // Fetch Inbox Emails from 'incomingEmails'
  useEffect(() => {
    if (!currentUser || activeTab !== 'inbox') {
        setIsLoadingInbox(false);
        setInboxEmails([]);
        return;
    }
    setIsLoadingInbox(true);
    const q = query(
        collection(db, "incomingEmails"),
        // TODO: Add filtering for userId if incomingEmails are associated with specific CRM users
        orderBy("receivedAt", "desc") 
    );
    console.log("Setting up inbox listener...");
    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Raw fetched data from Firestore (inbox emails):", snapshot.docs.map(d => d.data()));
        const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id));
        console.log("Mapped inbox emails for UI:", fetched);
        setInboxEmails(fetched);
        setIsLoadingInbox(false);
    }, (error) => {
        console.error("Error fetching inbox emails:", error);
        toast({ title: "Error al cargar Bandeja de Entrada", variant: "destructive", description: error.message });
        setIsLoadingInbox(false);
        setInboxEmails([]);
    });
    return () => {
        console.log("Cleaning up inbox listener");
        unsubscribe();
    };
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);


  // Fetch Sent, Pending, Draft Emails from 'outgoingEmails'
  useEffect(() => {
    if (!currentUser) {
        setIsLoadingSent(false);
        setIsLoadingPending(false);
        setIsLoadingDrafts(false);
        setSentEmails([]);
        setPendingEmails([]);
        setDraftEmails([]);
        return;
    }

    const setupListener = (
      status: EmailMessage['status'], 
      setData: React.Dispatch<React.SetStateAction<EmailMessage[]>>,
      setLoading: React.Dispatch<React.SetStateAction<boolean>>,
      collectionName: string = "outgoingEmails" // Default to outgoingEmails
    ) => {
        if (activeTab !== status && (collectionName === "outgoingEmails" && activeTab !== 'pending' && activeTab !== 'sent' && activeTab !== 'drafts') ) {
             setLoading(false);
             setData([]);
             return () => {}; // Return an empty unsubscribe function
        }
        setLoading(true);
        const q = query(
            collection(db, collectionName),
            where("userId", "==", currentUser.id),
            where("status", "==", status),
            orderBy("createdAt", "desc")
        );
        console.log(`Setting up listener for ${status} emails from ${collectionName}...`);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`Raw fetched data from Firestore (${status} emails from ${collectionName}):`, snapshot.docs.map(d => d.data()));
            const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id));
            console.log(`Mapped ${status} emails for UI (from ${collectionName}):`, fetched);
            setData(fetched);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching ${status} emails from ${collectionName}:`, error);
            toast({ title: `Error al cargar ${status}`, variant: "destructive", description: error.message });
            setLoading(false);
            setData([]);
        });
        return unsubscribe;
    };
    
    let unsubSent = () => {};
    let unsubPending = () => {};
    let unsubDrafts = () => {}; // Placeholder for drafts

    if (activeTab === 'sent') unsubSent = setupListener('sent', setSentEmails, setIsLoadingSent);
    else if (activeTab === 'pending') unsubPending = setupListener('pending', setPendingEmails, setIsLoadingPending);
    else if (activeTab === 'drafts') {
        // TODO: Implement draft fetching logic when save draft is implemented
        setIsLoadingDrafts(false);
        setDraftEmails([]); // Using mock for now
    }

    return () => {
        console.log("Cleaning up outgoing/draft email listeners for tab:", activeTab);
        unsubSent();
        unsubPending();
        unsubDrafts();
    };
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);


  const renderEmailList = (
    emailList: EmailMessage[],
    statusType: EmailMessage['status'] | 'inbox',
    isLoadingList: boolean,
    currentPage: number,
    setCurrentPage: (page: number) => void,
  ) => {
    if (isLoadingList) {
        return <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;
    }
    if (!emailList || emailList.length === 0) {
      return <p className="text-muted-foreground text-center py-8">No hay correos en esta carpeta.</p>;
    }

    const totalPages = Math.ceil(emailList.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedEmails = emailList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <div className="space-y-2">
        {paginatedEmails.map(email => (
          <div key={email.id} className="hover:shadow-md cursor-pointer border rounded-md" onClick={() => handleViewEmail(email)}>
            <CardContent className="p-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0"> {/* Added min-w-0 for truncation */}
                  <p className={`font-medium truncate ${!email.isRead && statusType === 'inbox' ? 'text-primary' : ''}`}>{email.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {statusType === 'inbox' ? `De: ${email.from?.name || email.from?.email}` : `Para: ${email.to?.map(t => t.name || t.email).join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2"> {/* Added shrink-0 and ml-2 */}
                    {statusType === 'pending' && <Clock className="h-3 w-3 text-amber-500 animate-pulse" title="En cola para envío"/>}
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{isValid(parseISO(email.date)) ? new Date(email.date).toLocaleDateString() : "Fecha Inv."}</p>
                </div>
              </div>
            </CardContent>
          </div>
        ))}
        {totalPages > 1 && (
          <div className="pt-4 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(Math.max(1, currentPage - 1)); }} aria-disabled={currentPage === 1} />
                </PaginationItem>
                {[...Array(totalPages)].map((_, i) => (
                  <PaginationItem key={i}>
                    <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(i + 1); }} isActive={currentPage === i + 1}>
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(Math.min(totalPages, currentPage + 1)); }} aria-disabled={currentPage === totalPages} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
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
                        handleEmailQueued();
                    }
                    return success;
                }}
                isSending={isSubmittingEmail}
                onClose={handleCloseComposer}
            />
        </div>
    );
  }

  if (selectedEmail) {
    return (
      <EmailDetailView
        email={selectedEmail}
        onClose={handleCloseEmailView}
        onReply={(emailToReply) => {
          handleOpenComposer({
            to: emailToReply.from.email,
            subject: `Re: ${emailToReply.subject}`,
            body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${new Date(emailToReply.date).toLocaleString()}\nPara: ${emailToReply.to.map(t => t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || (emailToReply.bodyHtml ? 'Ver HTML' : '')}`
          }, true);
        }}
        onReplyAll={(emailToReply) => {
          const allRecipients = [emailToReply.from, ...emailToReply.to, ...(emailToReply.cc || [])]
            .filter(rec => rec.email !== currentUser?.email) 
            .map(rec => rec.email);
          const uniqueRecipients = [...new Set(allRecipients)];

          handleOpenComposer({
            to: uniqueRecipients.join(','),
            subject: `Re: ${emailToReply.subject}`,
            body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${new Date(emailToReply.date).toLocaleString()}\nPara: ${emailToReply.to.map(t => t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || (emailToReply.bodyHtml ? 'Ver HTML' : '')}`
          }, true);
        }}
        onForward={(emailToForward) => {
           handleOpenComposer({
            subject: `Fwd: ${emailToForward.subject}`,
            body: `\n\n\n----- Mensaje Reenviado -----\nDe: ${emailToForward.from.name || emailToForward.from.email}\nEnviado: ${new Date(emailToForward.date).toLocaleString()}\nPara: ${emailToForward.to.map(t => t.email).join(', ')}\nAsunto: ${emailToForward.subject}\n\n${emailToForward.bodyHtml || emailToForward.bodyText}`
          }, true);
        }}
      />
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

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as any); setSelectedEmail(null);}} className="flex-grow flex flex-col">
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
                {renderEmailList(inboxEmails, 'inbox', isLoadingInbox, currentPageInbox, setCurrentPageInbox)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Correos en Cola de Envío</CardTitle></CardHeader>
            <CardContent>{renderEmailList(pendingEmails, 'pending', isLoadingPending, currentPagePending, setCurrentPagePending)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Correos Enviados</CardTitle></CardHeader>
            <CardContent>{renderEmailList(sentEmails, 'sent', isLoadingSent, currentPageSent, setCurrentPageSent)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drafts" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Borradores</CardTitle></CardHeader>
            <CardContent>{renderEmailList(draftEmails, 'draft', isLoadingDrafts, currentPageDrafts, setCurrentPageDrafts)}</CardContent>
          </Card>
        </TabsContent>
         <TabsContent value="trash" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Papelera</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground text-center py-8">La papelera está vacía.</p></CardContent>
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
            <strong className="text-amber-800">Composición y Puesta en Cola para Envío (Backend `sendSingleEmail`):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
          <p>
            <strong className="text-amber-800">Visualización de Correos en Cola ("Enviando"):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
           <p>
            <strong className="text-amber-800">Listado de Correos Enviados (desde `outgoingEmails`):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
           <p>
            <strong className="text-amber-800">Visualización Detallada de Correos y Paginación:</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
          <p>
            <strong className="text-amber-800">Acciones (Responder/Reenviar - Abre compositor):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
          <p>
            <strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización con `incomingEmails`):</strong> <span className="font-semibold text-green-600">Implementado (Lectura de `incomingEmails`).</span>
            <span className="block text-xs text-amber-700/80">Nota: La función `fetchIncomingEmailsImap` es responsable de poblar `incomingEmails`. La asociación de correos a usuarios específicos del CRM si la cuenta IMAP es compartida, y el marcado como leído/no leído, requieren lógica adicional.</span>
          </p>
           <p>
            <strong className="text-amber-800">Gestión de Borradores (Guardado y Carga):</strong> <span className="font-semibold text-orange-600">Planeado.</span>
          </p>
          <p>
            <strong className="text-amber-800">Adjuntos en Correos (Envío, Recepción y Visualización):</strong> <span className="font-semibold text-orange-600">Planeado.</span>
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

    