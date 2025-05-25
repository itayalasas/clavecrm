
"use client";

import * as React from "react";
import { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import type { EmailMessage, OutgoingEmail, Lead, Contact, FirestoreTimestamp, User, FolderType } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO, format, formatDistanceToNowStrict } from "date-fns";
import { es } from 'date-fns/locale';
import { EmailComposer } from "@/components/email/email-composer";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/lib/constants";
import { Mail as MailIcon, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit, Paperclip, UserPlus, XCircle, SeparatorVertical, Search, MessageSquare, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/lib/utils";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";


const ITEMS_PER_PAGE = 10;

// Helper function to parse Firestore date/timestamp fields
const parseFirestoreDateToISO = (fieldValue: any, fieldNameForLog?: string, docIdForLog?: string): string | undefined => {
    if (!fieldValue) return undefined;

    if (fieldValue instanceof Timestamp) {
      try {
        return fieldValue.toDate().toISOString();
      } catch (e) {
        console.warn(`Parse Date Error (Timestamp toDate) for ${fieldNameForLog} in doc ${docIdForLog}:`, e, "Value:", fieldValue);
        return undefined;
      }
    }
    if (typeof fieldValue === 'object' && typeof fieldValue.seconds === 'number' && typeof fieldValue.nanoseconds === 'number') {
      // This handles Firestore Timestamp-like objects that might not be direct instances
      try {
        const dateFromObject = new Date(fieldValue.seconds * 1000 + fieldValue.nanoseconds / 1000000);
        if (isValid(dateFromObject)) return dateFromObject.toISOString();
        else {
          console.warn(`Invalid date created from object for ${fieldNameForLog} in doc ${docIdForLog}:`, dateFromObject, "Original object:", fieldValue);
          return undefined;
        }
      } catch (e) {
        console.warn(`Parse Date Error (Object to Date) for ${fieldNameForLog} in doc ${docIdForLog}:`, e, "Value:", fieldValue);
        return undefined;
      }
    }
    if (typeof fieldValue === 'string') {
      const parsedDate = parseISO(fieldValue);
      if (isValid(parsedDate)) return parsedDate.toISOString();
      
      // Fallback for non-ISO strings, but with a strong warning
      try {
          const attemptParse = new Date(fieldValue);
          if (isValid(attemptParse)) {
              console.warn(`Date field '${fieldNameForLog}' in doc '${docIdForLog}' was a non-ISO string '${fieldValue}', parsed as local time. Consider storing as Timestamp in Firestore for consistency.`);
              return attemptParse.toISOString();
          } else {
               console.warn(`Invalid date string for '${fieldNameForLog}' in doc '${docIdForLog}':`, fieldValue, ". Expected Firestore Timestamp or ISO 8601 string.");
          }
      } catch(e) { 
        console.warn(`Error attempting to parse non-ISO string '${fieldValue}' with new Date() for ${fieldNameForLog} in doc ${docIdForLog}:`, e);
      }
      return undefined; 
    }
    console.warn(`Unexpected date format for '${fieldNameForLog}' in doc '${docIdForLog}':`, fieldValue, typeof fieldValue);
    return undefined; 
};


const mapFirestoreDocToEmailMessage = (
  docSnap: any, 
  currentUserIdParam: string | null,
  defaultStatus: EmailMessage['status'],
  sourceCollection: 'incomingEmails' | 'outgoingEmails'
): EmailMessage | null => {
  const data = docSnap.data();
  if (!data) {
    console.warn(`mapFirestoreDocToEmailMessage: No data for document ${docSnap.id} from collection ${sourceCollection}`);
    return null;
  }

  console.log(`Mapeando documento con ID: ${docSnap.id}, Colección: ${sourceCollection}`);
  
  let fromField: { name?: string; email: string } = { email: 'desconocido@sistema.com', name: 'Remitente Desconocido' };
  let toRecipients: { name?: string; email: string }[] = [{ email: 'destinatario-desconocido@sistema.com', name: 'Destinatario Desconocido' }];

  // From field
  if (data.from_parsed && Array.isArray(data.from_parsed) && data.from_parsed.length > 0 && data.from_parsed[0].address) {
    fromField = { email: data.from_parsed[0].address, name: data.from_parsed[0].name || undefined };
  } else if (typeof data.from === 'string') {
    const fromMatch = data.from.match(/^(.*?)\s*<([^>]+)>$/);
    if (fromMatch) fromField = { name: fromMatch[1].trim() || undefined, email: fromMatch[2].trim() };
    else if (data.from.includes('@')) fromField = { email: data.from.trim() };
    else fromField = { name: data.from.trim() || 'Remitente Desconocido', email: 'desconocido@sistema.com' };
  } else if (sourceCollection === 'outgoingEmails' && typeof data.fromEmail === 'string') {
    fromField = { email: data.fromEmail, name: data.fromName || undefined };
  }

  // To field
  if (data.to_parsed && Array.isArray(data.to_parsed) && data.to_parsed.length > 0) {
    toRecipients = data.to_parsed
      .map((t: any) => ({ email: t.address || 'desconocido@sistema.com', name: t.name || undefined }))
      .filter((t: any) => t.email && t.email !== 'desconocido@sistema.com');
  } else if (typeof data.to === 'string') {
    toRecipients = data.to.split(',')
      .map(emailStr => {
        const toMatch = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
        if (toMatch) return { name: toMatch[1].trim() || undefined, email: toMatch[2].trim() };
        if (emailStr.trim().includes('@')) return { email: emailStr.trim() };
        return null;
      })
      .filter(Boolean) as { name?: string; email: string }[];
  }
  if (toRecipients.length === 0) {
    toRecipients = [{ email: 'destinatario-desconocido@sistema.com', name: 'Destinatario Desconocido' }];
  }
  
  const parseAddressString = (addressString?: string): { name?: string; email: string }[] => {
    if (!addressString || typeof addressString !== 'string') return [];
    return addressString.split(',')
      .map(emailStr => {
        const match = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
        if (match) return { name: match[1].trim() || undefined, email: match[2].trim() };
        if (emailStr.trim().includes('@')) return { email: emailStr.trim() };
        return null; 
      })
      .filter(Boolean) as { name?: string; email: string }[];
  };
  const ccRecipients = parseAddressString(data.cc);
  const bccRecipients = parseAddressString(data.bcc);


  let mailDate: string = new Date(0).toISOString();
  let receivedAtDate: string | undefined;

  if (sourceCollection === 'incomingEmails') {
    mailDate = parseFirestoreDateToISO(data.date, 'date (incoming)', docSnap.id) || new Date(0).toISOString();
    receivedAtDate = parseFirestoreDateToISO(data.receivedAt, 'receivedAt (incoming)', docSnap.id);
  } else { 
    const sentAtParsed = parseFirestoreDateToISO(data.sentAt, 'sentAt (outgoing)', docSnap.id);
    const createdAtParsed = parseFirestoreDateToISO(data.createdAt, 'createdAt (outgoing)', docSnap.id);
    const updatedAtParsed = parseFirestoreDateToISO(data.updatedAt, 'updatedAt (outgoing)', docSnap.id);
    mailDate = sentAtParsed || updatedAtParsed || createdAtParsed || new Date(0).toISOString();
  }
  
  let emailIsRead = false;
  if (typeof data.isRead === 'boolean') {
    emailIsRead = data.isRead;
  } else {
    emailIsRead = sourceCollection === 'incomingEmails' ? false : true;
  }

  return {
    id: docSnap.id,
    subject: typeof data.subject === 'string' ? data.subject : "Sin Asunto",
    from: fromField,
    to: toRecipients,
    cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
    date: mailDate,
    receivedAt: sourceCollection === 'incomingEmails' ? (receivedAtDate || mailDate) : undefined,
    bodyHtml: typeof data.html === 'string' ? data.html : (typeof data.bodyHtml === 'string' ? data.bodyHtml : ""),
    bodyText: typeof data.text === 'string' ? data.text : (typeof data.bodyHtml === 'string' && data.bodyHtml.length > 0 ? data.bodyHtml.substring(0, 150) + "..." : "(Sin contenido de texto)"),
    status: data.status as EmailMessage['status'] || defaultStatus,
    isRead: emailIsRead,
    attachments: Array.isArray(data.attachments) ? data.attachments.map((att:any) => ({ name: att.name || "adjunto", url: att.url || "#", size: att.size, type: att.type })) : [],
    collectionSource: sourceCollection,
    threadId: data.threadId || undefined,
    relatedLeadId: data.relatedLeadId || undefined,
    relatedContactId: data.relatedContactId || undefined,
    relatedTicketId: data.relatedTicketId || undefined,
    crmUserId: data.crmUserId || data.userId || (currentUserIdParam || "unknown_user"),
    userId: data.userId || (currentUserIdParam || "unknown_user"),
  };
};


function EmailPageContent() {
  const emailNavItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = emailNavItem?.icon || MailIcon;
  const { toast } = useToast();
  const { currentUser, unreadInboxCount, isLoadingUnreadCount } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeFolder, setActiveFolder] = useState<FolderType>("inbox");
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  
  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now());
  const [composerInitialData, setComposerInitialData] = useState<{
    to?: string; cc?: string; bcc?: string; subject?: string; body?: string;
    attachments?: { name: string; url: string; size?: number; type?: string }[];
    draftId?: string | null;
  } | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [composerOpenedByButton, setComposerOpenedByButton] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [inboxEmails, setInboxEmails] = useState<EmailMessage[]>([]);
  const [sentEmails, setSentEmails] = useState<EmailMessage[]>([]);
  const [draftEmails, setDraftEmails] = useState<EmailMessage[]>([]);
  const [pendingEmails, setPendingEmails] = useState<EmailMessage[]>([]);
  const [deletedEmails, setDeletedEmails] = useState<EmailMessage[]>([]);
  
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [isLoadingSent, setIsLoadingSent] = useState(true);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(true);
  
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false); 
  const [isSavingDraftState, setIsSavingDraftState] = useState(false); 
  
  const [currentPageInbox, setCurrentPageInbox] = useState(1);
  const [currentPageSent, setCurrentPageSent] = useState(1);
  const [currentPagePending, setCurrentPagePending] = useState(1);
  const [currentPageDrafts, setCurrentPageDrafts] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);


  const handleOpenComposer = useCallback((initialData: Partial<typeof composerInitialData> = {}, openedByBtn: boolean = false, draftIdToEdit: string | null = null) => {
    setComposerInitialData({
        to: initialData.to || "",
        cc: initialData.cc || "",
        bcc: initialData.bcc || "",
        subject: initialData.subject ? decodeURIComponent(initialData.subject) : "",
        body: initialData.body ? decodeURIComponent(initialData.body) : "",
        attachments: initialData.attachments || [],
        draftId: draftIdToEdit || initialData.draftId || null,
    });
    setEditingDraftId(draftIdToEdit || initialData.draftId || null);
    setComposerKey(Date.now()); 
    setShowComposer(true);
    setSelectedEmail(null); 
    setComposerOpenedByButton(openedByBtn);

    if (openedByBtn || (!draftIdToEdit && (searchParams.has('to') || searchParams.has('subject') || searchParams.has('body')))) {
        const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
        currentUrlParams.delete('to');
        currentUrlParams.delete('cc');
        currentUrlParams.delete('bcc');
        currentUrlParams.delete('subject');
        currentUrlParams.delete('body');
        currentUrlParams.delete('emailId');
        router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
    setComposerInitialData(null);
    setComposerOpenedByButton(false);
    if (composerOpenedByButton) { 
        const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
        if (currentUrlParams.has('to') || currentUrlParams.has('subject') || currentUrlParams.has('body')) {
            currentUrlParams.delete('to'); currentUrlParams.delete('cc'); currentUrlParams.delete('bcc');
            currentUrlParams.delete('subject'); currentUrlParams.delete('body');
            router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
        }
    }
  }, [composerOpenedByButton, router, pathname, searchParams]);
  
  const markEmailAsRead = async (emailId: string, collectionSource: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser || !emailId || collectionSource !== 'incomingEmails') return;
    try {
      await updateDoc(doc(db, collectionSource, emailId), { isRead: true, updatedAt: serverTimestamp() });
      toast({ title: "Correo marcado como leído."});
      // No need to manually refetch inbox, onSnapshot will handle it
    } catch (error) {
      console.error(`Error al marcar correo ${emailId} como leído en ${collectionSource}:`, error);
      toast({ title: "Error al marcar correo como leído", variant: "destructive" });
    }
  };

  const handleViewEmail = (email: EmailMessage) => {
    if (email.status === 'draft' && currentUser && email.userId === currentUser.id) {
        handleOpenComposer({
            to: Array.isArray(email.to) ? email.to.map(t => t.email).join(',') : (email.to as any)?.email,
            cc: Array.isArray(email.cc) ? email.cc.map(c => c.email).join(',') : '',
            bcc: Array.isArray(email.bcc) ? email.bcc.map(b => b.email).join(',') : '',
            subject: email.subject,
            body: email.bodyHtml || email.bodyText,
            attachments: email.attachments,
        }, true, email.id);
    } else {
        setSelectedEmail(email);
        setShowComposer(false);
        if (email.collectionSource === 'incomingEmails' && !email.isRead) {
            markEmailAsRead(email.id, 'incomingEmails');
        }
    }
  };

  const handleCloseEmailView = () => setSelectedEmail(null);
  
  useEffect(() => {
    const fetchLeadsAndContacts = async () => {
        try {
            const [leadsSnapshot, contactsSnapshot] = await Promise.all([
                getDocs(collection(db, "leads")),
                getDocs(collection(db, "contacts"))
            ]);
            setLeads(leadsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Lead)));
            setContacts(contactsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Contact)));
        } catch (error) { console.error("Error fetching leads/contacts for email composer:", error); }
    };
    fetchLeadsAndContacts();
  }, []);
  
  useEffect(() => {
    const toParam = searchParams.get("to");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId"); 

    const allClientEmails = [...sentEmails, ...pendingEmails, ...inboxEmails, ...draftEmails, ...deletedEmails];

    if (emailIdParam && !showComposer && !selectedEmail) {
        const emailToOpen = allClientEmails.find(e => e.id === emailIdParam);
        if (emailToOpen) {
            handleViewEmail(emailToOpen);
        }
    } else if ((toParam || subjectParam || bodyParam) && !composerInitialData?.draftId && !selectedEmail && !showComposer) {
      handleOpenComposer({ to: toParam || "", subject: subjectParam || "", body: bodyParam || "" }, false);
    }
  }, [searchParams, handleOpenComposer, sentEmails, pendingEmails, inboxEmails, draftEmails, deletedEmails, showComposer, selectedEmail, composerInitialData]);


  const uploadAttachments = async (files: File[], userId: string, emailId: string): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    if (!files || files.length === 0) return [];
    const attachmentPromises = files.map(file => {
        const filePath = `email-attachments/${userId}/${emailId}/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, filePath);
        const uploadTask = uploadBytesResumable(fileRef, file);
        return new Promise<{ name: string; url: string; size: number; type: string }>((resolve, reject) => {
            uploadTask.on("state_changed", 
                (snapshot) => { /* Update progress if needed */ },
                (error) => { console.error("Error uploading attachment:", error); reject(error); },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve({ name: file.name, url: downloadURL, size: file.size, type: file.type });
                }
            );
        });
    });
    try {
        const results = await Promise.all(attachmentPromises);
        return results;
    } catch (error) {
        toast({ title: "Error al Subir Adjuntos", description: "No se pudieron subir uno o más archivos.", variant: "destructive" });
        return [];
    }
  };


  const handleQueueEmailForSending = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, newAttachments: File[]) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", variant: "destructive"});
        return false;
    }
    setIsSubmittingEmail(true);
    const isSendingDraft = !!editingDraftId;
    const emailIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id;

    let finalAttachments = (isSendingDraft && composerInitialData?.attachments) ? composerInitialData.attachments : [];
    if (newAttachments.length > 0) {
        const uploadedNew = await uploadAttachments(newAttachments, currentUser.id, emailIdToUse);
        finalAttachments = [...finalAttachments, ...uploadedNew.filter(att => !finalAttachments.some(existing => existing.url === att.url))];
    }
    
    const emailDoc: Partial<OutgoingEmail> = {
        to: data.to, 
        cc: data.cc || null, 
        bcc: data.bcc || null, 
        subject: data.subject,
        bodyHtml: data.body, 
        status: "pending", 
        userId: currentUser.id,
        fromName: currentUser.name || "Usuario CRM", 
        fromEmail: currentUser.email,
        attachments: finalAttachments.length > 0 ? finalAttachments : [],
        updatedAt: serverTimestamp(),
    };

    try {
        if (isSendingDraft) {
            const draftBeingSent = draftEmails.find(d => d.id === editingDraftId);
            await updateDoc(doc(db, "outgoingEmails", editingDraftId!), {
                ...emailDoc,
                createdAt: draftBeingSent?.date ? Timestamp.fromDate(new Date(draftBeingSent.date)) : serverTimestamp(),
            });
        } else {
            await setDoc(doc(db, "outgoingEmails", emailIdToUse), { ...emailDoc, createdAt: serverTimestamp() });
        }
        toast({ title: "Correo en Cola", description: `Tu correo para ${data.to} se enviará pronto.` });
        setEditingDraftId(null);
        return true;
    } catch (error) {
        console.error("Error al poner correo en cola:", error);
        toast({ title: "Error al Enviar", variant: "destructive" });
        return false;
    } finally { setIsSubmittingEmail(false); }
  };
  
  const handleEmailQueued = () => {
    handleCloseComposer();
    setActiveFolder("pending");
  };

  const handleSaveDraft = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, newAttachments: File[]) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", variant: "destructive"});
        return false;
    }
    setIsSavingDraftState(true);
    const draftIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id;
    
    let finalAttachments = (editingDraftId && composerInitialData?.attachments) ? composerInitialData.attachments : [];
    if (newAttachments.length > 0) {
        const uploadedNew = await uploadAttachments(newAttachments, currentUser.id, draftIdToUse);
         finalAttachments = [...finalAttachments, ...uploadedNew.filter(att => !finalAttachments.some(existing => existing.url === att.url))];
    }
    
    const draftDoc: Partial<OutgoingEmail> = { 
        to: data.to, 
        cc: data.cc || null, 
        bcc: data.bcc || null, 
        subject: data.subject,
        bodyHtml: data.body, 
        status: "draft", 
        userId: currentUser.id,
        fromName: currentUser.name || "Usuario CRM", 
        fromEmail: currentUser.email,
        attachments: finalAttachments.length > 0 ? finalAttachments : [],
        updatedAt: serverTimestamp(),
    };
    try {
        if (editingDraftId) {
            await updateDoc(doc(db, "outgoingEmails", editingDraftId), draftDoc);
        } else {
            await setDoc(doc(db, "outgoingEmails", draftIdToUse), { ...draftDoc, createdAt: serverTimestamp() });
        }
        toast({ title: "Borrador Guardado"});
        handleCloseComposer();
        setActiveFolder("drafts");
        return true;
    } catch (error) {
        console.error("Error al guardar borrador:", error);
        toast({ title: "Error al Guardar Borrador", variant: "destructive" });
        return false;
    } finally { setIsSavingDraftState(false); }
  };
  
  const handleDeleteEmail = async (email: EmailMessage) => {
    if (!currentUser || !email.id) return;
    const confirmDelete = window.confirm(`¿Estás seguro de que quieres mover este correo (${email.subject || "Sin Asunto"}) a la papelera?`);
    if (!confirmDelete) return;
    
    const collectionName = email.collectionSource;
    if (!collectionName) {
        toast({ title: "Error", description: "No se pudo determinar el origen del correo.", variant: "destructive"});
        return;
    }
    
    try {
        await updateDoc(doc(db, collectionName, email.id), { status: "deleted", updatedAt: serverTimestamp() });
        toast({ title: "Correo Movido a Papelera" });
        if (selectedEmail?.id === email.id) setSelectedEmail(null);
        setActiveFolder("trash"); 
    } catch (error) {
        console.error("Error moviendo correo a papelera:", error);
        toast({ title: "Error al Eliminar Correo", variant: "destructive" });
    }
  };


  const folders = useMemo(() => [
    { name: "inbox",    label: "Bandeja de Entrada", icon: Inbox,    count: isLoadingUnreadCount ? null : (unreadInboxCount || 0), isLoading: isLoadingInbox,    data: inboxEmails },
    { name: "pending",  label: "Enviando",           icon: Clock,    count: pendingEmails.length,  isLoading: isLoadingPending,  data: pendingEmails },
    { name: "sent",     label: "Enviados",           icon: Send,     count: sentEmails.length,     isLoading: isLoadingSent,     data: sentEmails },
    { name: "drafts",   label: "Borradores",         icon: ArchiveIcon, count: draftEmails.length,    isLoading: isLoadingDrafts,   data: draftEmails },
    { name: "trash",    label: "Papelera",           icon: Trash2,   count: deletedEmails.length,  isLoading: isLoadingDeleted,  data: deletedEmails, disabled: false },
  ], [
    unreadInboxCount, isLoadingUnreadCount, 
    inboxEmails, pendingEmails, sentEmails, draftEmails, deletedEmails, 
    isLoadingInbox, isLoadingPending, isLoadingSent, isLoadingDrafts, isLoadingDeleted
  ]);


  // Fetch Inbox Emails
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    console.log(`INBOX: Intentando consulta para usuario ${currentUser?.id} en pestaña ${currentEmailFolderTab}`);
    
    if (!currentUser || currentEmailFolderTab !== 'inbox') {
      console.log("INBOX: Condiciones NO cumplidas para la suscripción. CurrentUser:", !!currentUser, "ActiveFolder:", currentEmailFolderTab);
      setIsLoadingInbox(false); setInboxEmails([]);
      if (unsubscribe) unsubscribe(); // Ensure an existing subscription is cleaned up
      return;
    }
    
    console.log(`INBOX: Intentando consulta para usuario ${currentUser.id} en pestaña ${currentEmailFolderTab}`);
    setIsLoadingInbox(true);
    const q = query(
        collection(db, "incomingEmails"),
        where("userId", "==", currentUser.id), // Assuming incomingEmails are tagged with CRM user ID
        orderBy("receivedAt", "desc")
    );
     console.log("INBOX: Firestore Query (conceptual):", `collection(db, "incomingEmails"), where("userId", "==", ${currentUser.id}), orderBy("receivedAt", "desc")`);
    
    unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Snapshot de Bandeja de Entrada recibido. ¿Vacío?:", snapshot.empty, "Número de docs:", snapshot.size);
      if (snapshot.empty) {
        console.log("INBOX: No hay documentos en 'incomingEmails' para este usuario o la consulta no los devuelve.");
      }
      
      console.log("Raw fetched data from Firestore (inbox emails):", snapshot.docs.map(d => ({id: d.id, ...d.data()})));

      const fetched = snapshot.docs.map(docSnap => {
        try {
          return mapFirestoreDocToEmailMessage(docSnap, currentUser?.id || "system_user_fallback", 'received', 'incomingEmails');
        } catch (mapError: any) {
          console.error(`Error mapeando el documento de la bandeja de entrada ${docSnap.id}:`, mapError, "Datos:", docSnap.data());
          return null; 
        }
      }).filter(Boolean) as EmailMessage[];
      console.log("Mapped inbox emails for UI:", JSON.parse(JSON.stringify(fetched)));
      setInboxEmails(fetched);
      setIsLoadingInbox(false);
    }, (error) => {
      console.error("ERROR GRAVE AL OBTENER BANDEJA DE ENTRADA (onSnapshot):", error);
      toast({ title: "Error Crítico al Cargar Bandeja de Entrada", variant: "destructive", description: `Detalles: ${error.message}. Revisa los permisos de Firestore para 'incomingEmails'.` });
      setIsLoadingInbox(false); setInboxEmails([]);
    });
    return () => {
      if (unsubscribe) {
        console.log("INBOX: Desuscribiendo de la bandeja de entrada.");
        unsubscribe();
      }
    };
  }, [currentUser, currentEmailFolderTab, toast]); // Added mapFirestoreDocToEmailMessage to dependencies
  
  const createCommonOutgoingEffect = (
    folderType: FolderType,
    statusToFetch: EmailMessage['status'] | EmailMessage['status'][],
    setData: React.Dispatch<React.SetStateAction<EmailMessage[]>>,
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
    orderByField: "createdAt" | "updatedAt" | "sentAt" = "createdAt"
  ) => {
    console.log(`DEBUG: Setting up effect for ${folderType}`);
    let unsubscribe: (() => void) | undefined;
    if (!currentUser || currentEmailFolderTab !== folderType) {
      console.log(`${folderType.toUpperCase()}: Condiciones NO cumplidas. CurrentUser: ${!!currentUser}, ActiveFolder: ${currentEmailFolderTab}`);
      setIsLoading(false); setData([]);
      if (unsubscribe) unsubscribe();
      return;
    }
    console.log(`${folderType.toUpperCase()}: Intentando consulta para usuario ${currentUser.id}`);
    setIsLoading(true);
    const q = query(
      collection(db, "outgoingEmails"),
      where("userId", "==", currentUser.id),
      where("status", Array.isArray(statusToFetch) ? "in" : "==", statusToFetch),
      orderBy(orderByField, "desc")
    );
     console.log(`${folderType.toUpperCase()}: Firestore Query (conceptual): collection(db, "outgoingEmails"), where("userId", "==", ${currentUser.id}), where("status", "${Array.isArray(statusToFetch) ? "in" : "=="}", ${statusToFetch}), orderBy("${orderByField}", "desc")`);

    unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Snapshot de ${folderType} recibido. ¿Vacío?:`, snapshot.empty, "Número de docs:", snapshot.size);
      console.log(`Raw fetched data from Firestore (${folderType} emails):`, snapshot.docs.map(d => ({id: d.id, ...d.data()})));
      const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, Array.isArray(statusToFetch) ? statusToFetch[0] : statusToFetch, 'outgoingEmails')).filter(Boolean) as EmailMessage[];
      console.log(`Mapped ${folderType} emails for UI:`, JSON.parse(JSON.stringify(fetched)));
      setData(fetched);
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching ${folderType} emails:`, error);
      toast({ title: `Error al cargar ${folderType}`, variant: "destructive", description: error.message });
      setIsLoading(false); setData([]);
    });
    return () => {
      if (unsubscribe) {
        console.log(`${folderType.toUpperCase()}: Desuscribiendo de ${folderType}.`);
        unsubscribe();
      }
    };
  };

  // Renamed activeTab to currentEmailFolderTab
  const [currentEmailFolderTab, setCurrentEmailFolderTab] = useState<FolderType>("inbox");

  useEffect(() => createCommonOutgoingEffect("sent", "sent", setSentEmails, setIsLoadingSent, "sentAt"), [currentUser, currentEmailFolderTab, toast]);
  useEffect(() => createCommonOutgoingEffect("pending", "pending", setPendingEmails, setIsLoadingPending, "createdAt"), [currentUser, currentEmailFolderTab, toast]);
  useEffect(() => createCommonOutgoingEffect("drafts", "draft", setDraftEmails, setIsLoadingDrafts, "updatedAt"), [currentUser, currentEmailFolderTab, toast]);
  useEffect(() => createCommonOutgoingEffect("trash", "deleted", setDeletedEmails, setIsLoadingDeleted, "updatedAt"), [currentUser, currentEmailFolderTab, toast]);

  const emailsToDisplay = folders.find(f => f.name === currentEmailFolderTab)?.data || [];
  const isLoadingCurrentList = folders.find(f => f.name === currentEmailFolderTab)?.isLoading || false;

  const currentPageForFolder = 
      currentEmailFolderTab === 'inbox' ? currentPageInbox :
      currentEmailFolderTab === 'pending' ? currentPagePending :
      currentEmailFolderTab === 'sent' ? currentPageSent :
      currentEmailFolderTab === 'drafts' ? currentPageDrafts :
      currentEmailFolderTab === 'trash' ? currentPageDeleted : 1;

  const setCurrentPageForFolder = 
      currentEmailFolderTab === 'inbox' ? setCurrentPageInbox :
      currentEmailFolderTab === 'pending' ? setCurrentPagePending :
      currentEmailFolderTab === 'sent' ? setCurrentPageSent :
      currentEmailFolderTab === 'drafts' ? setCurrentPageDrafts :
      currentEmailFolderTab === 'trash' ? setCurrentPageDeleted : React.useState(1)[1];


  const totalPages = Math.ceil(emailsToDisplay.length / ITEMS_PER_PAGE);
  const paginatedEmails = emailsToDisplay.slice((currentPageForFolder - 1) * ITEMS_PER_PAGE, currentPageForFolder * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPageForFolder(1); }, [currentEmailFolderTab, setCurrentPageForFolder]);


  const renderEmailListItem = (email: EmailMessage, folderType: FolderType) => (
    <div
      key={email.id}
      className={cn(
          "w-full text-left p-2.5 hover:bg-accent focus-visible:bg-accent outline-none border-b cursor-pointer",
          selectedEmail?.id === email.id && "bg-primary/10",
          !email.isRead && folderType === 'inbox' && "bg-primary/5 border-l-2 border-primary font-semibold"
      )}
      onClick={() => handleViewEmail(email)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleViewEmail(email)}
    >
      <div className="flex justify-between items-start text-xs mb-0.5">
        <p className={cn(
            "truncate max-w-[150px] md:max-w-[200px] text-sm", 
            !email.isRead && folderType === 'inbox' ? "text-primary font-bold" : "text-foreground font-medium"
        )}>
          {folderType === 'sent' || folderType === 'pending' || folderType === 'drafts' || folderType === 'trash'
           ? (Array.isArray(email.to) && email.to.length > 0 ? `Para: ${email.to.map(t=>t.name || t.email).join(', ')}` : "Para: Desconocido") 
           : (email.from.name || email.from.email)}
        </p>
        <time className="text-muted-foreground text-[10px] shrink-0 whitespace-nowrap">
          {isValid(parseISO(email.date)) ? formatDistanceToNowStrict(parseISO(email.date), { addSuffix: true, locale: es}) : "Fecha Inv."}
        </time>
      </div>
      <p className={cn("text-sm truncate", !email.isRead && folderType === 'inbox' ? "text-primary" : "")}>
          {email.subject || "(Sin Asunto)"}
      </p>
      <p className="text-xs text-muted-foreground truncate mt-0.5 h-4">
        {email.bodyText || (typeof email.bodyHtml === 'string' && email.bodyHtml.trim() !== "" ? "" : "(Sin contenido)")}
      </p>
      {(folderType === 'pending' && email.status === 'pending') && <Clock className="h-3 w-3 text-amber-500 inline-block mr-1 animate-pulse" />}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Card className="shadow-lg shrink-0 rounded-none border-0 border-b md:rounded-t-lg md:border md:mt-0 mt-[-1rem] md:ml-0 ml-[-1rem] md:mr-0 mr-[-1rem]">
        <CardHeader className="p-3 md:p-4">
            <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
                <PageIcon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                {emailNavItem?.label || "Correo Electrónico"}
            </CardTitle>
        </CardHeader>
      </Card>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Folders */}
        <div className={cn("w-56 md:w-64 bg-muted/50 border-r p-3 flex-col hidden md:flex shrink-0", (showComposer || selectedEmail) && "md:hidden lg:flex")}>
           <Button onClick={() => handleOpenComposer(undefined, true)} className="w-full mb-4" size="lg">
            <Edit className="mr-2 h-4 w-4"/> Correo Nuevo
          </Button>
          <ScrollArea className="flex-grow">
            <nav className="flex flex-col gap-1">
              {folders.map(folder => (
                <Button
                  key={folder.name}
                  variant={currentEmailFolderTab === folder.name ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-9"
                  onClick={() => { setCurrentEmailFolderTab(folder.name); setSelectedEmail(null); setShowComposer(false); }}
                  disabled={folder.disabled}
                >
                  <folder.icon className={cn("mr-2 h-4 w-4", currentEmailFolderTab === folder.name ? "text-primary" : "text-muted-foreground")} /> 
                  {folder.label}
                  {folder.count !== undefined && folder.count !== null && folder.count > 0 && (
                    <Badge 
                      className={cn(
                        "ml-auto text-xs px-1.5 py-0.5 font-normal h-5",
                        folder.name === 'inbox' && folder.count > 0 ? "bg-red-500 text-white hover:bg-red-600" : 
                        (folder.name === 'drafts' ? "bg-muted-foreground/30 text-black hover:bg-muted-foreground/40" : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30")
                      )}
                    >
                      {folder.count > 99 ? '99+' : folder.count}
                    </Badge>
                  )}
                  {folder.isLoading && <Loader2 className="ml-auto h-3 w-3 animate-spin"/>}
                </Button>
              ))}
            </nav>
          </ScrollArea>
        </div>
        <Separator orientation="vertical" className="h-full hidden md:block"/>

        {/* Middle Pane: Email List */}
         <div className={cn(
            "flex-1 flex flex-col overflow-hidden", 
            (showComposer || selectedEmail) && "hidden md:flex flex-[1.5] xl:flex-[2]",
            "md:border-r" 
        )}>
          <div className="p-3 border-b flex items-center justify-between shrink-0">
             <div className="relative flex-grow mr-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    type="search"
                    placeholder={`Buscar en ${folders.find(f=>f.name===currentEmailFolderTab)?.label || 'correos'}...`}
                    className="pl-8 w-full h-9 text-sm"
                />
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={() => handleOpenComposer(undefined, true)}>
                <Edit className="h-5 w-5"/>
            </Button>
          </div>
          {isLoadingCurrentList ? (
            <div className="flex-grow flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : paginatedEmails.length === 0 ? (
            <div className="flex-grow flex items-center justify-center text-muted-foreground p-4 text-center">
              <p className="text-sm">No hay correos en "{folders.find(f=>f.name===currentEmailFolderTab)?.label}".</p>
            </div>
          ) : (
            <ScrollArea className="flex-grow">
              <div className="divide-y">
                {paginatedEmails.map(email => renderEmailListItem(email, currentEmailFolderTab))}
              </div>
            </ScrollArea>
          )}
           {totalPages > 1 && (
            <div className="p-2 border-t flex justify-center shrink-0">
              <Pagination>
                <PaginationContent>
                  <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPageForFolder(p => Math.max(1, p - 1)); }} disabled={currentPageForFolder === 1} /></PaginationItem>
                  {[...Array(Math.min(3, totalPages))].map((_, i) => {
                      let pageNum = currentPageForFolder <= 2 ? i + 1 : (currentPageForFolder >= totalPages - 1 ? totalPages - 2 + i : currentPageForFolder - 1 + i);
                      if (pageNum < 1 || pageNum > totalPages) return null;
                      return <PaginationItem key={pageNum}><PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPageForFolder(pageNum); }} isActive={currentPageForFolder === pageNum}>{pageNum}</PaginationLink></PaginationItem>;
                  })}
                  {totalPages > 3 && currentPageForFolder < totalPages - 1 && <PaginationItem><PaginationEllipsis/></PaginationItem>}
                  <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPageForFolder(p => Math.min(totalPages, p + 1)); }} disabled={currentPageForFolder === totalPages} /></PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
        <Separator orientation="vertical" className="h-full hidden md:block"/>

        {/* Right Pane: Email Detail or Composer */}
        <div className={cn(
            "flex-1 flex-col overflow-hidden bg-background flex-[2] xl:flex-[3]", 
            (!selectedEmail && !showComposer) && "hidden md:flex",
            (selectedEmail || showComposer) && "flex" 
        )}>
          {showComposer && composerInitialData ? (
              <EmailComposer
                key={composerKey}
                initialTo={composerInitialData.to}
                initialCc={composerInitialData.cc}
                initialBcc={composerInitialData.bcc}
                initialSubject={composerInitialData.subject}
                initialBody={composerInitialData.body}
                initialAttachments={composerInitialData.attachments}
                onQueueEmail={async (data, attachments) => {
                    const success = await handleQueueEmailForSending(data, attachments);
                    if (success) { handleEmailQueued(); }
                    return success;
                }}
                onSaveDraft={handleSaveDraft}
                isSending={isSubmittingEmail} isSavingDraft={isSavingDraftState}
                onClose={handleCloseComposer}
                leads={leads} contacts={contacts}
              />
          ) : selectedEmail ? (
            <EmailDetailView
              email={selectedEmail}
              onClose={handleCloseEmailView}
              onReply={(emailToReply) => handleOpenComposer({ to: emailToReply.from.email, subject: `Re: ${emailToReply.subject}`, body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${isValid(parseISO(emailToReply.date)) ? format(parseISO(emailToReply.date), 'PPpp', {locale: es}) : 'Fecha inválida'}\nPara: ${emailToReply.to.map(t=>t.name || t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || ""}`}, true)}
              onReplyAll={(emailToReply) => { 
                const allRecipients = [
                    emailToReply.from.email,
                    ...(emailToReply.to?.map(r => r.email) || []),
                    ...(emailToReply.cc?.map(r => r.email) || [])
                ].filter(emailAddr => emailAddr && emailAddr !== currentUser?.email); 
                const uniqueRecipients = Array.from(new Set(allRecipients));
                handleOpenComposer({ 
                    to: uniqueRecipients.join(','),
                    subject: `Re: ${emailToReply.subject}`, 
                    body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${isValid(parseISO(emailToReply.date)) ? format(parseISO(emailToReply.date), 'PPpp', {locale: es}) : 'Fecha inválida'}\nPara: ${emailToReply.to.map(t=>t.name || t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || ""}`
                }, true);
              }}
              onForward={(emailToForward) => handleOpenComposer({ subject: `Fwd: ${emailToForward.subject}`, body: `\n\n\n----- Mensaje Reenviado -----\nDe: ${emailToForward.from.name || emailToForward.from.email}\nEnviado: ${isValid(parseISO(emailToForward.date)) ? format(parseISO(emailToForward.date), 'PPpp', {locale: es}) : 'Fecha inválida'}\nPara: ${emailToForward.to.map(t=>t.name || t.email).join(', ')}\nAsunto: ${emailToForward.subject}\n\n${emailToForward.bodyHtml || emailToForward.bodyText || ""}`, attachments: emailToForward.attachments }, true)}
              onDelete={(emailId, currentStatus, collectionSource) => handleDeleteEmail({id: emailId, status: currentStatus, collectionSource: collectionSource} as EmailMessage)}
            />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <MailIcon size={48} className="mb-4 text-primary/50" />
              <p className="text-lg font-medium">Selecciona un correo para leerlo</p>
              <p className="text-sm">o crea un correo nuevo desde el panel de carpetas.</p>
              <Button onClick={() => handleOpenComposer(undefined, true)} className="mt-4 md:hidden">
                <Edit className="mr-2 h-4 w-4"/> Correo Nuevo
              </Button>
            </div>
          )}
        </div>
      </div>

       <Card className="mt-4 bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center text-amber-700 text-lg gap-2">
            <AlertTriangle className="h-5 w-5" />
            Estado de Desarrollo del Módulo de Correo
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600 space-y-2">
          <p><strong className="text-amber-800">Redacción y Puesta en Cola (Backend `sendSingleEmail`):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Visualización de Pendientes, Enviados, Borradores:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Borradores aún no guardan adjuntos correctamente).</p>
          <p><strong className="text-amber-800">Guardar/Cargar Borradores (Texto):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Adjuntar Archivos (Subida a Storage y Enlace en Firestore):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización de Servidor IMAP/API):</strong> <Badge className="bg-green-500 text-white">Parcial (Backend IMAP implementado, UI lee 'incomingEmails' por userId)</Badge>. Se necesita lógica para asociar correos a usuarios CRM específicos si la cuenta IMAP es compartida.</p>
          <p><strong className="text-amber-800">Marcar como Leído/No Leído (Bandeja de Entrada):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Papelera y Eliminación Lógica:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Búsqueda y Filtros Avanzados en Listas:</strong> <Badge className="bg-yellow-500 text-black">Pendiente</Badge>.</p>
          <p><strong className="text-amber-800">Plantillas de Correo para Respuestas Rápidas:</strong> <Badge className="bg-yellow-500 text-black">Pendiente</Badge>.</p>
          <p><strong className="text-amber-800">Sincronización Completa con Múltiples Cuentas Personales (Seguridad de Credenciales):</strong> <Badge className="bg-orange-500 text-white">Avanzado/Pendiente</Badge> (Requiere gestión segura de credenciales y backend robusto).</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmailPage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-6 h-full"><Skeleton className="h-16 w-full shrink-0" /><div className="flex flex-1 overflow-hidden"><Skeleton className="w-64 border-r shrink-0"/><Skeleton className="flex-1 border-r"/><Skeleton className="flex-1"/></div></div>}>
      <EmailPageContent />
    </Suspense>
  );
}

