
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
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore'; // Added doc, getDoc
import type { EmailMessage } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO } from "date-fns";
import { EmailDetailView } from "@/components/email/email-detail-view"; // New import
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"; // New import

const ITEMS_PER_PAGE = 10;

function EmailPageContent() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = navItem?.icon || MailIcon;
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"inbox" | "pending" | "sent" | "drafts" | "trash">("inbox");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now());
  const [composerInitialTo, setComposerInitialTo] = useState("");
  const [composerInitialSubject, setComposerInitialSubject] = useState("");
  const [composerInitialBody, setComposerInitialBody] = useState("");
  const [composerOpenedByButton, setComposerOpenedByButton] = useState(false);

  const [sentEmails, setSentEmails] = useState<EmailMessage[]>([]);
  const [draftEmails, setDraftEmails] = useState<EmailMessage[]>([]);
  const [pendingEmails, setPendingEmails] = useState<EmailMessage[]>([]);
  const [inboxEmails, setInboxEmails] = useState<EmailMessage[]>([]); // For mock inbox

  const [isLoadingSent, setIsLoadingSent] = useState(true);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true); // For mock inbox

  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [currentPageInbox, setCurrentPageInbox] = useState(1);
  const [currentPageSent, setCurrentPageSent] = useState(1);
  const [currentPagePending, setCurrentPagePending] = useState(1);
  const [currentPageDrafts, setCurrentPageDrafts] = useState(1);


  const searchParams = useSearchParams();

  const handleOpenComposer = useCallback((initialData: { to?: string, subject?: string, body?: string } = {}, openedByBtn = false) => {
    setSelectedEmail(null); // Close email detail view if open
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
    const emailIdParam = searchParams.get("emailId"); // For viewing a specific email

    if (emailIdParam) {
      // Placeholder: Fetch and display specific email
      // This would typically involve fetching the email by ID from Firestore
      // For now, we'll try to find it in mock data or recently fetched lists
      const findEmail = (id: string, list: EmailMessage[]) => list.find(e => e.id === id);
      let emailToView = findEmail(emailIdParam, sentEmails) ||
                        findEmail(emailIdParam, pendingEmails) ||
                        findEmail(emailIdParam, inboxEmails) ||
                        findEmail(emailIdParam, draftEmails);

      if (emailToView) {
        handleViewEmail(emailToView);
      } else {
        // Potentially fetch from DB if not found in current lists
        // getDoc(doc(db, "outgoingEmails", emailIdParam)).then(docSnap => ...);
        toast({ title: "Correo no encontrado", description: `No se pudo cargar el correo con ID: ${emailIdParam}`, variant: "destructive"});
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
      await addDoc(collection(db, "outgoingEmails"), {
        to: data.to,
        cc: data.cc || null,
        bcc: data.bcc || null,
        subject: data.subject,
        bodyHtml: data.body,
        status: "pending",
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
      setActiveTab("pending");
  };

  const mapFirestoreDocToEmailMessage = (docSnap: any, currentUserId: string | null, defaultFromName: string | null, defaultFromEmail: string | null): EmailMessage => {
    const data = docSnap.data();
    let mailDate = new Date(0).toISOString();
    if (data.status === 'sent' && data.sentAt) {
        if (data.sentAt instanceof Timestamp) mailDate = data.sentAt.toDate().toISOString();
        else if (typeof data.sentAt === 'string' && isValid(parseISO(data.sentAt))) mailDate = data.sentAt;
    } else if (data.createdAt) {
        if (data.createdAt instanceof Timestamp) mailDate = data.createdAt.toDate().toISOString();
        else if (typeof data.createdAt === 'string' && isValid(parseISO(data.createdAt))) mailDate = data.createdAt;
    }

    return {
        id: docSnap.id,
        subject: typeof data.subject === 'string' ? data.subject : "Sin Asunto",
        to: typeof data.to === 'string'
            ? [{ email: data.to }]
            : (Array.isArray(data.to)
                ? data.to.map((t: any) => (typeof t === 'string' ? { email: t } : (t && typeof t.email === 'string' ? t : { email: 'desconocido' })))
                : [{ email: 'desconocido' }]),
        from: { email: data.fromEmail || defaultFromEmail || "sistema@crm.com", name: data.fromName || defaultFromName || "Sistema CRM" },
        cc: typeof data.cc === 'string' ? data.cc.split(',').map(e => ({ email: e.trim() })) : (Array.isArray(data.cc) ? data.cc : []),
        bcc: typeof data.bcc === 'string' ? data.bcc.split(',').map(e => ({ email: e.trim() })) : (Array.isArray(data.bcc) ? data.bcc : []),
        date: mailDate,
        bodyHtml: typeof data.bodyHtml === 'string' ? data.bodyHtml : "",
        bodyText: typeof data.bodyHtml === 'string' ? data.bodyHtml.substring(0, 100) + "..." : "Cuerpo vacío",
        status: data.status as EmailMessage['status'],
        userId: typeof data.userId === 'string' ? data.userId : (currentUserId || "unknown_user"),
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        isRead: typeof data.isRead === 'boolean' ? data.isRead : data.status === 'sent' || data.status === 'pending', // Sent/Pending assumed read by sender
        labels: Array.isArray(data.labels) ? data.labels : [],
    };
  };

  // Mock Inbox Data (replace with actual fetching)
  useEffect(() => {
    setIsLoadingInbox(true);
    const mockInbox: EmailMessage[] = [
        { id: 'inbox-1', subject: 'Consulta sobre Producto X', from: { email: 'cliente@example.com', name: 'Cliente Interesado' }, to: [{email: currentUser?.email || 'test@example.com'}], date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), bodyHtml: '<p>Hola, me gustaría saber más sobre el Producto X. ¿Podrían enviarme más información?</p>', status: 'received', isRead: false, userId: currentUser?.id || 'mockUserId' },
        { id: 'inbox-2', subject: '¡Promoción Especial!', from: { email: 'marketing@empresa.com', name: 'Marketing Empresa' }, to: [{email: currentUser?.email || 'test@example.com'}], date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), bodyHtml: '<p>No te pierdas nuestras ofertas exclusivas de esta semana. ¡Hasta 50% de descuento!</p>', status: 'received', isRead: true, userId: currentUser?.id || 'mockUserId' },
    ];
    setInboxEmails(mockInbox);
    setIsLoadingInbox(false);
  }, [currentUser]);


  // Fetch Sent Emails
  useEffect(() => {
    if (!currentUser || (activeTab !== 'sent' && activeTab !== 'pending' && activeTab !== 'drafts')) { // Consolidate listener for all outgoing
        setIsLoadingSent(false);
        setIsLoadingPending(false);
        setIsLoadingDrafts(false);
        // Optionally clear arrays if not needed when tab isn't active, or keep them cached
        // setSentEmails([]);
        // setPendingEmails([]);
        // setDraftEmails([]);
        return;
    }

    const statusesToFetch: EmailMessage['status'][] = [];
    if (activeTab === 'sent') { setIsLoadingSent(true); statusesToFetch.push('sent'); }
    if (activeTab === 'pending') { setIsLoadingPending(true); statusesToFetch.push('pending'); }
    if (activeTab === 'drafts') { setIsLoadingDrafts(true); statusesToFetch.push('draft'); }

    if (statusesToFetch.length === 0) return; // Should not happen with current logic

    const q = query(
        collection(db, "outgoingEmails"),
        where("userId", "==", currentUser.id),
        where("status", "in", statusesToFetch),
        orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const allFetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, currentUser.name, currentUser.email));

        if (activeTab === 'sent') {
            setSentEmails(allFetched.filter(e => e.status === 'sent'));
            setIsLoadingSent(false);
        }
        if (activeTab === 'pending') {
            setPendingEmails(allFetched.filter(e => e.status === 'pending'));
            setIsLoadingPending(false);
        }
        if (activeTab === 'drafts') {
            setDraftEmails(allFetched.filter(e => e.status === 'draft'));
            // Mock drafts for now as save draft is not implemented
            setDraftEmails([ { id: 'draft-1', subject: 'Borrador: Seguimiento Post-Reunión', from: { email: currentUser.email, name: currentUser.name || "Yo"}, to: [{ email: 'prospecto@example.com' }], date: new Date().toISOString(), bodyHtml: '<p>Gracias por la reunión de hoy...</p>', status: 'draft', userId: currentUser.id } ]);
            setIsLoadingDrafts(false);
        }
    }, (error) => {
        console.error(`Error fetching emails for tab ${activeTab}:`, error);
        toast({ title: `Error al cargar ${activeTab}`, variant: "destructive", description: error.message });
        if (activeTab === 'sent') setIsLoadingSent(false);
        if (activeTab === 'pending') setIsLoadingPending(false);
        if (activeTab === 'drafts') setIsLoadingDrafts(false);
    });
    return () => unsubscribe();
  }, [currentUser, activeTab, toast]);


  const renderEmailList = (
    emailList: EmailMessage[],
    statusType: EmailMessage['status'] | 'inbox',
    isLoadingList: boolean,
    currentPage: number,
    setCurrentPage: (page: number) => void,
    onEmailClick: (email: EmailMessage) => void
  ) => {
    if (isLoadingList) {
        return <Skeleton className="h-40 w-full" />;
    }
    if (emailList.length === 0) {
      return <p className="text-muted-foreground text-center py-8">No hay correos en esta carpeta.</p>;
    }

    const totalPages = Math.ceil(emailList.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedEmails = emailList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <div className="space-y-2">
        {paginatedEmails.map(email => (
          <div key={email.id} className="hover:shadow-md cursor-pointer border rounded-md" onClick={() => onEmailClick(email)}>
            <CardContent className="p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className={`font-medium ${!email.isRead && statusType === 'inbox' ? 'text-primary' : ''}`}>{email.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {statusType === 'inbox' ? `De: ${email.from?.name || email.from?.email}` : `Para: ${email.to?.map(t => t.name || t.email).join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                    {statusType === 'pending' && <Clock className="h-3 w-3 text-amber-500 animate-pulse" title="En cola para envío"/>}
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{new Date(email.date).toLocaleDateString()}</p>
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
            .filter(rec => rec.email !== currentUser?.email) // Exclude self
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-grow flex flex-col">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 shrink-0">
          <TabsTrigger value="inbox"><Inbox className="mr-2 h-4 w-4" />Bandeja de Entrada</TabsTrigger>
          <TabsTrigger value="pending"><Clock className="mr-2 h-4 w-4" />Enviando</TabsTrigger>
          <TabsTrigger value="sent"><Send className="mr-2 h-4 w-4" />Enviados</TabsTrigger>
          <TabsTrigger value="drafts"><Archive className="mr-2 h-4 w-4" />Borradores</TabsTrigger>
          {/* <TabsTrigger value="trash" disabled><Trash2 className="mr-2 h-4 w-4" />Papelera</TabsTrigger> */}
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
                {renderEmailList(inboxEmails, 'inbox', isLoadingInbox, currentPageInbox, setCurrentPageInbox, handleViewEmail)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Correos en Cola de Envío</CardTitle></CardHeader>
            <CardContent>{renderEmailList(pendingEmails, 'pending', isLoadingPending, currentPagePending, setCurrentPagePending, handleViewEmail)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Correos Enviados</CardTitle></CardHeader>
            <CardContent>{renderEmailList(sentEmails, 'sent', isLoadingSent, currentPageSent, setCurrentPageSent, handleViewEmail)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drafts" className="flex-grow mt-4">
          <Card>
            <CardHeader><CardTitle>Borradores</CardTitle></CardHeader>
            <CardContent>{renderEmailList(draftEmails, 'draft', isLoadingDrafts, currentPageDrafts, setCurrentPageDrafts, handleViewEmail)}</CardContent>
          </Card>
        </TabsContent>

         {/* <TabsContent value="trash" className="flex-grow mt-4">
           <Card><CardHeader><CardTitle>Papelera</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground text-center py-8">Funcionalidad de papelera en desarrollo.</p></CardContent>
           </Card>
        </TabsContent> */}
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
            <strong className="text-amber-800">Redacción y Puesta en Cola para Envío:</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
           <p>
            <strong className="text-amber-800">Visualización de Correos en Cola ("Enviando"):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
          <p>
            <strong className="text-amber-800">Listado de Correos Enviados:</strong> <span className="font-semibold text-green-600">Implementado</span> (desde `outgoingEmails`).
          </p>
          <p>
            <strong className="text-amber-800">Visualización de Detalles del Correo:</strong> <span className="font-semibold text-green-600">Implementado</span> (para correos enviados/pendientes).
          </p>
          <p>
            <strong className="text-amber-800">Paginación en Listas:</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
          <p>
            <strong className="text-amber-800">Responder/Reenviar (Abre compositor):</strong> <span className="font-semibold text-yellow-600">Parcial</span> (Abre compositor, pre-llena campos básicos).
          </p>
          <p>
            <strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización):</strong> <span className="font-semibold text-red-600">Pendiente (Simulado con datos de ejemplo).</span>
          </p>
           <p>
            <strong className="text-amber-800">Gestión de Borradores:</strong> <span className="font-semibold text-red-600">Pendiente (Simulado, no se guardan en DB).</span>
          </p>
          <p>
            <strong className="text-amber-800">Adjuntos en Correos:</strong> <span className="font-semibold text-orange-600">Planeado</span> (envío y visualización).
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
