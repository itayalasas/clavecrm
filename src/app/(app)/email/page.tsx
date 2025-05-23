
"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail as MailIcon, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { EmailComposer } from "@/components/email/email-composer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import type { EmailMessage, OutgoingEmail, Lead, Contact, FirestoreTimestamp } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO } from "date-fns";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";

const ITEMS_PER_PAGE = 10;

const parseFirestoreDateToISO = (fieldValue: any): string | undefined => {
    if (!fieldValue) return undefined;
    if (fieldValue instanceof Timestamp) { // Firestore Timestamp (from server)
        return fieldValue.toDate().toISOString();
    }
    if (typeof fieldValue === 'object' && fieldValue.seconds !== undefined && fieldValue.nanoseconds !== undefined) { // Firestore Timestamp (from client before conversion)
        return new Date(fieldValue.seconds * 1000 + fieldValue.nanoseconds / 1000000).toISOString();
    }
    if (typeof fieldValue === 'string') { // Already an ISO string
        const parsedDate = parseISO(fieldValue);
        if (isValid(parsedDate)) {
            return parsedDate.toISOString();
        }
    }
    console.warn("Invalid date format received for email:", fieldValue);
    return undefined;
};


function EmailPageContent() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = navItem?.icon || MailIcon;
  const { toast } = useToast();
  const { currentUser, getAllUsers } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"inbox" | "pending" | "sent" | "drafts" | "trash">("inbox");
  
  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now());
  const [composerInitialTo, setComposerInitialTo] = useState("");
  const [composerInitialSubject, setComposerInitialSubject] = useState("");
  const [composerInitialBody, setComposerInitialBody] = useState("");
  const [composerInitialAttachments, setComposerInitialAttachments] = useState<{ name: string; url: string; size?: number; type?: string }[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const [sentEmails, setSentEmails] = useState<EmailMessage[]>([]);
  const [draftEmails, setDraftEmails] = useState<EmailMessage[]>([]);
  const [pendingEmails, setPendingEmails] = useState<EmailMessage[]>([]);
  const [inboxEmails, setInboxEmails] = useState<EmailMessage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);


  const [isLoadingSent, setIsLoadingSent] = useState(true);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [currentPageInbox, setCurrentPageInbox] = useState(1);
  const [currentPageSent, setCurrentPageSent] = useState(1);
  const [currentPagePending, setCurrentPagePending] = useState(1);
  const [currentPageDrafts, setCurrentPageDrafts] = useState(1);

  const handleOpenComposer = useCallback((initialData: { to?: string, subject?: string, body?: string, attachments?: any[], draftId?: string | null } = {}) => {
    setSelectedEmail(null);
    setComposerInitialTo(initialData.to || "");
    setComposerInitialSubject(decodeURIComponent(initialData.subject || ""));
    setComposerInitialBody(decodeURIComponent(initialData.body || ""));
    setComposerInitialAttachments(initialData.attachments || []);
    setEditingDraftId(initialData.draftId || null);
    setComposerKey(Date.now());
    setShowComposer(true);
    
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.delete('to');
    current.delete('subject');
    current.delete('body');
    current.delete('emailId');
    router.replace(`/email?${current.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
    const fromUrlParams = searchParams.get("to") || searchParams.get("subject") || searchParams.get("body");
    if (fromUrlParams) {
        const current = new URLSearchParams(Array.from(searchParams.entries()));
        current.delete('to');
        current.delete('subject');
        current.delete('body');
        router.replace(`/email?${current.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  const markEmailAsRead = async (emailId: string, collectionName: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, collectionName, emailId), { isRead: true });
      // Optimistic update of local state for immediate UI feedback
      if (collectionName === 'incomingEmails') {
        setInboxEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: true } : e));
      }
    } catch (error) {
      console.error(`Error marking email ${emailId} as read in ${collectionName}:`, error);
      toast({ title: "Error al marcar correo como leído", variant: "destructive" });
    }
  };

  const handleViewEmail = (email: EmailMessage) => {
    if (email.status === 'draft' && currentUser && email.userId === currentUser.id) {
        handleOpenComposer({
            to: email.to.map(t => t.email).join(','),
            subject: email.subject,
            body: email.bodyHtml || email.bodyText,
            attachments: email.attachments,
            draftId: email.id,
        });
    } else {
        setSelectedEmail(email);
        setShowComposer(false);
        if (email.status === 'received' && !email.isRead) {
            markEmailAsRead(email.id, 'incomingEmails');
        }
    }
  };

  const handleCloseEmailView = () => {
    setSelectedEmail(null);
  };

  useEffect(() => {
    const fetchLeadsAndContacts = async () => {
        try {
            const [leadsSnapshot, contactsSnapshot] = await Promise.all([
                getDocs(collection(db, "leads")),
                getDocs(collection(db, "contacts"))
            ]);
            setLeads(leadsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Lead)));
            setContacts(contactsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Contact)));
        } catch (error) {
            console.error("Error fetching leads/contacts for email composer:", error);
            toast({title: "Error al cargar datos de destinatarios", variant: "destructive"});
        }
    };
    fetchLeadsAndContacts();
  }, [toast]);


  useEffect(() => {
    const toParam = searchParams.get("to");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId");

    if (emailIdParam && !showComposer && !selectedEmail) {
      const findEmail = (id: string, list: EmailMessage[]) => list.find(e => e.id === id);
      let emailToView = findEmail(emailIdParam, sentEmails) ||
                        findEmail(emailIdParam, pendingEmails) ||
                        findEmail(emailIdParam, inboxEmails) ||
                        findEmail(emailIdParam, draftEmails);

      if (emailToView) {
        handleViewEmail(emailToView);
      }
    } else if ((toParam || subjectParam || bodyParam) && !editingDraftId && !selectedEmail) {
      handleOpenComposer({ to: toParam || "", subject: subjectParam || "", body: bodyParam || "" });
    }
  }, [searchParams, handleOpenComposer, sentEmails, pendingEmails, inboxEmails, draftEmails, showComposer, editingDraftId, selectedEmail]);

  const uploadAttachments = async (files: File[], userId: string, emailId: string): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    const attachmentPromises = files.map(file => {
        const filePath = `email-attachments/${userId}/${emailId}/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, filePath);
        const uploadTask = uploadBytesResumable(fileRef, file);

        return new Promise<{ name: string; url: string; size: number; type: string }>((resolve, reject) => {
            uploadTask.on(
                "state_changed",
                null,
                (error) => reject(error),
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve({ name: file.name, url: downloadURL, size: file.size, type: file.type });
                }
            );
        });
    });
    return Promise.all(attachmentPromises);
  };

  const handleQueueEmailForSending = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, attachments: File[]) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión para enviar correos.", variant: "destructive"});
        return false;
    }
    setIsSubmittingEmail(true);
    try {
      const emailDocId = editingDraftId || doc(collection(db, "outgoingEmails")).id;
      const uploadedAttachments = attachments.length > 0 ? await uploadAttachments(attachments, currentUser.id, emailDocId) : [];

      const emailDoc: Omit<OutgoingEmail, 'id' | 'createdAt' | 'sentAt' | 'errorMessage' | 'updatedAt'> = {
        to: data.to,
        cc: data.cc || null,
        bcc: data.bcc || null,
        subject: data.subject,
        bodyHtml: data.body,
        status: "pending",
        userId: currentUser.id,
        fromName: currentUser.name || "Usuario CRM",
        fromEmail: currentUser.email,
        attachments: uploadedAttachments,
      };

      if (editingDraftId) {
        await setDoc(doc(db, "outgoingEmails", editingDraftId), { ...emailDoc, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, {merge: true});
      } else {
        await setDoc(doc(db, "outgoingEmails", emailDocId), { ...emailDoc, createdAt: serverTimestamp() });
      }
      
      toast({
        title: "Correo en Cola para Envío",
        description: `Tu correo para ${data.to} ha sido puesto en cola y se enviará pronto.`,
      });
      handleCloseComposer();
      setActiveTab("pending");
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

  const handleSaveDraft = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, attachments: File[]) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", variant: "destructive"});
        return false;
    }
    setIsSavingDraft(true);
    try {
        const draftId = editingDraftId || doc(collection(db, "outgoingEmails")).id;
        const uploadedAttachments = attachments.length > 0 ? await uploadAttachments(attachments, currentUser.id, draftId) : [];

        const draftDoc: Partial<OutgoingEmail> = { // Use Partial as not all fields might be present yet
            to: data.to,
            cc: data.cc || null,
            bcc: data.bcc || null,
            subject: data.subject,
            bodyHtml: data.body,
            status: "draft",
            userId: currentUser.id,
            fromName: currentUser.name || "Usuario CRM",
            fromEmail: currentUser.email,
            attachments: uploadedAttachments,
            updatedAt: serverTimestamp(),
        };

        if (editingDraftId) {
            await updateDoc(doc(db, "outgoingEmails", editingDraftId), draftDoc);
        } else {
            await setDoc(doc(db, "outgoingEmails", draftId), { ...draftDoc, createdAt: serverTimestamp() });
        }

        toast({ title: "Borrador Guardado", description: "Tu correo ha sido guardado como borrador." });
        handleCloseComposer();
        setActiveTab("drafts");
        return true;
    } catch (error) {
        console.error("Error al guardar borrador:", error);
        toast({ title: "Error al Guardar Borrador", variant: "destructive" });
        return false;
    } finally {
      setIsSavingDraft(false);
    }
  };
  
  const handleDeleteEmail = async (emailId: string, currentStatus: EmailMessage['status']) => {
    if (!currentUser) return;
    if (!window.confirm("¿Estás seguro de que quieres mover este correo a la papelera?")) return;

    const collectionName = (currentStatus === 'received') ? 'incomingEmails' : 'outgoingEmails';
    try {
        await updateDoc(doc(db, collectionName, emailId), {
            status: "deleted",
            updatedAt: serverTimestamp()
        });
        toast({ title: "Correo Movido a Papelera" });
        if (selectedEmail?.id === emailId) setSelectedEmail(null);
        // Optimistically remove or refetch will handle it
    } catch (error) {
        console.error("Error moviendo correo a papelera:", error);
        toast({ title: "Error al Eliminar Correo", variant: "destructive" });
    }
  };

  const mapFirestoreDocToEmailMessage = useCallback((docSnap: any, currentUserId: string | null, defaultStatus: EmailMessage['status'] = 'received'): EmailMessage => {
    const data = docSnap.data();
    
    let mailDate = parseFirestoreDateToISO(data.sentAt || data.receivedAt || data.createdAt || data.updatedAt) || new Date(0).toISOString();

    let fromField = { email: 'desconocido@sistema.com', name: 'Sistema' };
    if (data.from && typeof data.from === 'string') { // Common for incoming emails from simpleParser
        fromField = { email: data.from };
    } else if (data.from && typeof data.from.email === 'string') { // If 'from' is an object with email
        fromField = data.from;
    } else if (data.fromEmail) { // For outgoing emails
        fromField = { email: data.fromEmail, name: data.fromName || (currentUser?.name || "Usuario CRM") };
    }

    let toRecipients: { name?: string; email: string }[] = [];
    if (typeof data.to === 'string') {
        toRecipients = data.to.split(',').map((e: string) => ({ email: e.trim() }));
    } else if (Array.isArray(data.to)) {
        toRecipients = data.to.map((t: any) => (typeof t === 'string' ? { email: t } : (t && typeof t.email === 'string' ? t : { email: 'desconocido' })));
    } else {
        toRecipients = [{ email: 'desconocido' }];
    }
    
    let ccRecipients: { name?: string; email: string }[] = [];
    if (typeof data.cc === 'string') {
        ccRecipients = data.cc.split(',').map((e: string) => ({ email: e.trim() }));
    } else if (Array.isArray(data.cc)) {
        ccRecipients = data.cc.map((c: any) => (typeof c === 'string' ? { email: c } : (c && typeof c.email === 'string' ? c : undefined))).filter(Boolean) as { name?: string; email: string }[];
    }

    let bccRecipients: { name?: string; email: string }[] = [];
     if (typeof data.bcc === 'string') {
        bccRecipients = data.bcc.split(',').map((e: string) => ({ email: e.trim() }));
    } else if (Array.isArray(data.bcc)) {
        bccRecipients = data.bcc.map((b: any) => (typeof b === 'string' ? { email: b } : (b && typeof b.email === 'string' ? b : undefined))).filter(Boolean) as { name?: string; email: string }[];
    }


    return {
        id: docSnap.id,
        subject: typeof data.subject === 'string' ? data.subject : "Sin Asunto",
        from: fromField,
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        date: mailDate,
        receivedAt: parseFirestoreDateToISO(data.receivedAt),
        bodyHtml: typeof data.html === 'string' ? data.html : (typeof data.bodyHtml === 'string' ? data.bodyHtml : ""),
        bodyText: typeof data.text === 'string' ? data.text : (typeof data.bodyHtml === 'string' ? data.bodyHtml.replace(/<[^>]+>/g, '').substring(0, 150) + "..." : ""),
        status: data.status as EmailMessage['status'] || defaultStatus, 
        userId: typeof data.userId === 'string' ? data.userId : (currentUserId || "unknown_user"),
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        isRead: typeof data.isRead === 'boolean' ? data.isRead : (data.status === 'sent' || data.status === 'pending' || data.status === 'draft'), 
        labels: Array.isArray(data.labels) ? data.labels : [],
    };
  }, [currentUser]);


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
        // TODO: Add where clause if incomingEmails are associated with specific CRM users, e.g., where("crmRecipientUserId", "==", currentUser.id)
        orderBy("receivedAt", "desc") 
    );
    console.log("Subscribing to inbox emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Raw fetched data from Firestore (inbox emails):", snapshot.docs.map(d => d.data()));
        const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'received'));
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
      console.log("Unsubscribing from inbox emails");
      unsubscribe();
    }
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);


  // Fetch Sent Emails from 'outgoingEmails'
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
        orderBy("createdAt", "desc") // or sentAt if preferred and always present
    );
    console.log("Subscribing to sent emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Raw fetched data from Firestore (sent emails):", snapshot.docs.map(d => d.data()));
        const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'sent'));
        console.log("Mapped sent emails for UI:", fetched);
        setSentEmails(fetched);
        setIsLoadingSent(false);
    }, (error) => {
        console.error("Error fetching sent emails:", error);
        toast({ title: "Error al cargar enviados", variant: "destructive", description: error.message });
        setIsLoadingSent(false);
        setSentEmails([]);
    });
     return () => {
      console.log("Unsubscribing from sent emails");
      unsubscribe();
    }
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);

  // Fetch Pending Emails from 'outgoingEmails'
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
    console.log("Subscribing to pending emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Raw fetched data from Firestore (pending emails):", snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'pending'));
      console.log("Mapped pending emails for UI:", fetched);
      setPendingEmails(fetched);
      setIsLoadingPending(false);
    }, (error) => {
      console.error("Error fetching pending emails:", error);
      toast({ title: "Error al cargar correos en cola", variant: "destructive", description: error.message });
      setIsLoadingPending(false);
      setPendingEmails([]);
    });
     return () => {
      console.log("Unsubscribing from pending emails");
      unsubscribe();
    }
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);

  // Fetch Draft Emails from 'outgoingEmails'
  useEffect(() => {
    if (!currentUser || activeTab !== 'drafts') {
      setIsLoadingDrafts(false);
      setDraftEmails([]);
      return;
    }
    setIsLoadingDrafts(true);
    const q = query(
      collection(db, "outgoingEmails"),
      where("userId", "==", currentUser.id),
      where("status", "==", "draft"),
      orderBy("updatedAt", "desc") // Order by updatedAt, fallback to createdAt
    );
    console.log("Subscribing to draft emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Raw fetched data from Firestore (draft emails):", snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'draft'));
      console.log("Mapped draft emails for UI:", fetched);
      setDraftEmails(fetched);
      setIsLoadingDrafts(false);
    }, (error) => {
      console.error("Error fetching draft emails:", error);
      toast({ title: "Error al cargar borradores", variant: "destructive", description: error.message });
      setIsLoadingDrafts(false);
      setDraftEmails([]);
    });
     return () => {
      console.log("Unsubscribing from draft emails");
      unsubscribe();
    }
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
                <div className="min-w-0">
                  <p className={`font-medium truncate ${!email.isRead && statusType === 'inbox' ? 'text-primary font-semibold' : ''}`}>{email.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {statusType === 'inbox' ? `De: ${email.from?.name || email.from?.email}` : `Para: ${email.to?.map(t => t.name || t.email).join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
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
                initialAttachments={composerInitialAttachments}
                onQueueEmail={async (data, attachments) => {
                    const success = await handleQueueEmailForSending(data, attachments);
                    if (success) {
                        handleCloseComposer();
                        setActiveTab("pending");
                    }
                    return success;
                }}
                onSaveDraft={async (data, attachments) => {
                    const success = await handleSaveDraft(data, attachments);
                    if (success) {
                        handleCloseComposer();
                        setActiveTab("drafts");
                    }
                    return success;
                }}
                isSending={isSubmittingEmail}
                isSavingDraft={isSavingDraft}
                onClose={handleCloseComposer}
                leads={leads}
                contacts={contacts}
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
          });
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
          });
        }}
        onForward={(emailToForward) => {
           handleOpenComposer({
            subject: `Fwd: ${emailToForward.subject}`,
            body: `\n\n\n----- Mensaje Reenviado -----\nDe: ${emailToForward.from.name || emailToForward.from.email}\nEnviado: ${new Date(emailToForward.date).toLocaleString()}\nPara: ${emailToForward.to.map(t => t.email).join(', ')}\nAsunto: ${emailToForward.subject}\n\n${emailToForward.bodyHtml || emailToForward.bodyText}`
          });
        }}
        onDelete={() => handleDeleteEmail(selectedEmail.id, selectedEmail.status)}
      />
    );
  }

  const tabsConfig = [
    { value: "inbox" as const, label: "Bandeja de Entrada", icon: Inbox, data: inboxEmails, isLoading: isLoadingInbox, page: currentPageInbox, setPage: setCurrentPageInbox },
    { value: "pending" as const, label: "Enviando", icon: Clock, data: pendingEmails, isLoading: isLoadingPending, page: currentPagePending, setPage: setCurrentPagePending },
    { value: "sent" as const, label: "Enviados", icon: Send, data: sentEmails, isLoading: isLoadingSent, page: currentPageSent, setPage: setCurrentPageSent },
    { value: "drafts" as const, label: "Borradores", icon: ArchiveIcon, data: draftEmails, isLoading: isLoadingDrafts, page: currentPageDrafts, setPage: setCurrentPageDrafts, count: draftEmails.length },
    { value: "trash" as const, label: "Papelera", icon: Trash2, data: [], isLoading: false, page: 1, setPage: () => {}, disabled: true }
  ];

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
          {tabsConfig.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
              <tab.icon className="mr-2 h-4 w-4" />{tab.label}
              {tab.value === "drafts" && tab.count !== undefined && tab.count > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs px-1.5 py-0.5">{tab.count}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {tabsConfig.map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="flex-grow mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{tab.label}</CardTitle>
                  {tab.value === "inbox" && (
                    <Button onClick={() => handleOpenComposer()} size="sm">
                        <PlusCircle className="mr-2 h-4 w-4"/> Redactar Nuevo Correo
                    </Button>
                  )}
              </CardHeader>
              <CardContent>{renderEmailList(tab.data, tab.value, tab.isLoading, tab.page, tab.setPage)}</CardContent>
            </Card>
          </TabsContent>
        ))}
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
            <strong className="text-amber-800">Redacción y Puesta en Cola para Envío (Backend `sendSingleEmail`):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
           <p>
            <strong className="text-amber-800">Visualización de Correos Pendientes y Enviados (desde `outgoingEmails`):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
           <p>
            <strong className="text-amber-800">Guardar/Cargar Borradores:</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
           <p>
            <strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
          <p>
            <strong className="text-amber-800">Acciones (Responder/Reenviar - Abre compositor):</strong> <span className="font-semibold text-green-600">Implementado.</span>
          </p>
           <p>
            <strong className="text-amber-800">Adjuntos en Correos (Envío, Guardado en Borrador, Visualización):</strong> <span className="font-semibold text-green-600">Implementado (Subida a Firebase Storage).</span>
          </p>
          <p>
            <strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización con `incomingEmails`):</strong> <span className="font-semibold text-green-600">Implementado (Lectura de `incomingEmails` vía Cloud Function IMAP).</span>
            <span className="block text-xs text-amber-700/80">Nota: Mejoras pendientes: asociación de correos a usuarios específicos del CRM (si la cuenta IMAP es compartida), marcar como leído/no leído, manejo avanzado de adjuntos en la recepción.</span>
          </p>
           <p>
            <strong className="text-amber-800">Papelera (Eliminación Lógica):</strong> <span className="font-semibold text-yellow-600">Parcial (Lógica de marcar como 'deleted' implementada).</span>
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
