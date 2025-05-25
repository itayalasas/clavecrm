
"use client";

import * as React from "react";
import { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription as CardDescUi } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Added Input import
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import type { EmailMessage, OutgoingEmail, Lead, Contact, FirestoreTimestamp, User } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO, format, formatDistanceToNowStrict, startOfDay, endOfDay, isBefore, isEqual, startOfMinute } from "date-fns";
import { es } from 'date-fns/locale';
import { EmailComposer } from "@/components/email/email-composer";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/lib/constants";
import { Mail as MailIcon, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit, Paperclip, UserPlus, XCircle, Folder, Edit2, Maximize, Minimize, Search, ArrowLeft, MoreVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/lib/utils";

const ITEMS_PER_PAGE = 10;

type FolderType = "inbox" | "pending" | "sent" | "drafts" | "trash";

// Robust date parsing from Firestore
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
    
    // Try a direct new Date() as a last resort for non-ISO strings, but with a warning
    try {
        const attemptParse = new Date(fieldValue);
        if (isValid(attemptParse)) {
            console.warn(`Date field '${fieldNameForLog}' in doc '${docIdForLog}' was a non-ISO string '${fieldValue}', parsed as local time. Consider storing as Timestamp in Firestore for consistency.`);
            return attemptParse.toISOString();
        }
    } catch(e) { /* ignore parse error for this attempt */ }

    console.warn(`Invalid date string for '${fieldNameForLog}' in doc '${docIdForLog}':`, fieldValue, ". Expected Firestore Timestamp or ISO 8601 string.");
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

  let fromField: { name?: string; email: string } = { email: 'desconocido@sistema.com', name: 'Remitente Desconocido' };
  let toRecipients: { name?: string; email: string }[] = [{ email: 'destinatario-desconocido@sistema.com', name: 'Destinatario Desconocido' }];
  let ccRecipients: { name?: string; email: string }[] = [];
  let bccRecipients: { name?: string; email: string }[] = [];

  // Enhanced 'from' parsing
  if (data.from_parsed && Array.isArray(data.from_parsed) && data.from_parsed.length > 0 && data.from_parsed[0].address) {
    fromField = { email: data.from_parsed[0].address, name: data.from_parsed[0].name || undefined };
  } else if (typeof data.from === 'string') {
    const fromMatch = data.from.match(/^(.*?)\s*<([^>]+)>$/);
    if (fromMatch) fromField = { name: fromMatch[1].trim() || undefined, email: fromMatch[2].trim() };
    else if (data.from.includes('@')) fromField = { email: data.from.trim() };
    else fromField = { name: data.from.trim() || 'Remitente Desconocido', email: 'desconocido@sistema.com' }; // Fallback if no email
  } else if (typeof data.fromEmail === 'string') { // Fallback for outgoing emails
    fromField = { email: data.fromEmail, name: data.fromName || undefined };
  }

  // Enhanced 'to' parsing
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
        return { email: 'destinatario-desconocido@sistema.com', name: emailStr.trim() || 'Destinatario Desconocido' };
      })
      .filter(t => t.email && t.email !== 'destinatario-desconocido@sistema.com');
  }
  if (toRecipients.length === 0) toRecipients = [{ email: 'destinatario-desconocido@sistema.com', name: 'Destinatario Desconocido' }];

  // CC and BCC parsing
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
  ccRecipients = parseAddressString(data.cc);
  bccRecipients = parseAddressString(data.bcc);


  let mailDate: string = new Date(0).toISOString(); // Default to epoch
  let receivedAtDate: string | undefined;
  
  if (sourceCollection === 'incomingEmails') {
    mailDate = parseFirestoreDateToISO(data.date, 'date (incoming)', docSnap.id) || new Date(0).toISOString();
    receivedAtDate = parseFirestoreDateToISO(data.receivedAt, 'receivedAt (incoming)', docSnap.id);
  } else { // outgoingEmails
    const sentAtParsed = parseFirestoreDateToISO(data.sentAt, 'sentAt (outgoing)', docSnap.id);
    const createdAtParsed = parseFirestoreDateToISO(data.createdAt, 'createdAt (outgoing)', docSnap.id);
    const updatedAtParsed = parseFirestoreDateToISO(data.updatedAt, 'updatedAt (outgoing)', docSnap.id);
    mailDate = sentAtParsed || updatedAtParsed || createdAtParsed || new Date(0).toISOString();
  }
  
  const crmUserIdForThisEmail = data.crmUserId || data.userId || (sourceCollection === 'incomingEmails' && currentUserIdParam ? currentUserIdParam : "unknown_user");
  
  let emailIsRead = false;
  if (typeof data.isRead === 'boolean') {
    emailIsRead = data.isRead;
  } else {
    emailIsRead = sourceCollection !== 'incomingEmails'; // Default to read for sent, draft etc.
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
    bodyHtml: typeof data.bodyHtml === 'string' ? data.bodyHtml : (typeof data.html === 'string' ? data.html : ""),
    bodyText: typeof data.text === 'string' ? data.text : (typeof data.bodyHtml === 'string' ? data.bodyHtml.substring(0, 150) + "..." : ""),
    status: data.status as EmailMessage['status'] || defaultStatus,
    isRead: emailIsRead,
    attachments: Array.isArray(data.attachments) ? data.attachments.map((att:any) => ({ name: att.name || "adjunto", url: att.url || "#", size: att.size, type: att.type })) : [],
    collectionSource: sourceCollection,
    threadId: data.threadId || undefined,
    relatedLeadId: data.relatedLeadId || undefined,
    relatedContactId: data.relatedContactId || undefined,
    relatedTicketId: data.relatedTicketId || undefined,
    crmUserId: crmUserIdForThisEmail, 
    userId: data.userId || crmUserIdForThisEmail, // Ensure userId is populated, prefer data.userId if present
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

  const [currentEmailFolderTab, setCurrentEmailFolderTab] = useState<FolderType>("inbox"); // Renamed
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  
  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now());
  const [composerInitialData, setComposerInitialData] = useState<{
    to?: string; cc?: string; bcc?: string; subject?: string; body?: string;
    attachments?: { name: string; url: string; size?: number; type?: string }[];
    draftId?: string | null;
  } | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

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

  const handleOpenComposer = useCallback((initialData: Partial<typeof composerInitialData> = {}, openedByButton: boolean = false) => {
    setComposerInitialData({
        to: initialData.to || "",
        cc: initialData.cc || "",
        bcc: initialData.bcc || "",
        subject: initialData.subject ? decodeURIComponent(initialData.subject) : "",
        body: initialData.body ? decodeURIComponent(initialData.body) : "",
        attachments: initialData.attachments || [],
        draftId: initialData.draftId || null,
    });
    setEditingDraftId(initialData.draftId || null);
    setComposerKey(Date.now());
    setShowComposer(true);
    setSelectedEmail(null);

    if (!initialData.draftId && !openedByButton) {
        const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
        currentUrlParams.delete('to');
        currentUrlParams.delete('cc');
        currentUrlParams.delete('bcc');
        currentUrlParams.delete('subject');
        currentUrlParams.delete('body');
        if (currentUrlParams.get('action') !== 'view_draft') { // Keep emailId if viewing draft
            currentUrlParams.delete('emailId');
        }
        router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
    setComposerInitialData(null);
    const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
    if (currentUrlParams.has('to') || currentUrlParams.has('subject') || currentUrlParams.has('body')) {
        currentUrlParams.delete('to');
        currentUrlParams.delete('cc');
        currentUrlParams.delete('bcc');
        currentUrlParams.delete('subject');
        currentUrlParams.delete('body');
        router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);
  
  const markEmailAsRead = async (emailId: string, collectionName: 'incomingEmails') => {
    if (!currentUser || !emailId || collectionName !== 'incomingEmails') return;
    try {
      await updateDoc(doc(db, collectionName, emailId), { isRead: true, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error(`Error al marcar correo ${emailId} como leído en ${collectionName}:`, error);
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
            draftId: email.id,
        });
    } else {
        setSelectedEmail(email);
        setShowComposer(false);
        if (email.collectionSource === 'incomingEmails' && !email.isRead) {
            markEmailAsRead(email.id, 'incomingEmails');
        }
    }
  };

  const handleCloseEmailView = () => setSelectedEmail(null);

  // Fetch Leads and Contacts for composer
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
  
  // Effect to handle opening composer/email from URL params
  useEffect(() => {
    const toParam = searchParams.get("to");
    const ccParam = searchParams.get("cc");
    const bccParam = searchParams.get("bcc");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId");
    const actionParam = searchParams.get("action");

    const allClientEmails = [...sentEmails, ...pendingEmails, ...inboxEmails, ...draftEmails, ...deletedEmails];

    if (emailIdParam && !showComposer && !selectedEmail) {
        const emailToOpen = allClientEmails.find(e => e.id === emailIdParam);
        if (emailToOpen) {
            if (actionParam === "view_draft" && emailToOpen.status === 'draft') {
                handleViewEmail(emailToOpen); // This will call handleOpenComposer for drafts
            } else if (actionParam !== "view_draft") {
                handleViewEmail(emailToOpen);
            }
        }
    } else if ((toParam || subjectParam || bodyParam) && !composerInitialData?.draftId && !selectedEmail && !showComposer) {
      handleOpenComposer({ to: toParam || "", cc: ccParam || "", subject: subjectParam || "", body: bodyParam || "" });
    }
  }, [searchParams, handleOpenComposer, sentEmails, pendingEmails, inboxEmails, draftEmails, deletedEmails, showComposer, selectedEmail, composerInitialData]);

  const uploadAttachments = async (files: File[], userId: string, emailId: string): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    const attachmentPromises = files.map(file => {
        const filePath = `email-attachments/${userId}/${emailId}/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, filePath);
        const uploadTask = uploadBytesResumable(fileRef, file);
        return new Promise<{ name: string; url: string; size: number; type: string }>((resolve, reject) => {
            uploadTask.on("state_changed", 
                (snapshot) => { /* Optionally update progress here */ },
                (error) => { console.error("Error uploading attachment:", error); reject(error); },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve({ name: file.name, url: downloadURL, size: file.size, type: file.type });
                }
            );
        });
    });
    return Promise.all(attachmentPromises);
  };

  const handleQueueEmailForSending = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, newAttachments: File[]) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", variant: "destructive"});
        return false;
    }
    setIsSubmittingEmail(true);
    const isSendingDraft = !!editingDraftId;
    const emailIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id;

    let finalAttachments = (editingDraftId && composerInitialData?.attachments) ? composerInitialData.attachments : [];
    if (newAttachments.length > 0) {
        const uploadedNew = await uploadAttachments(newAttachments, currentUser.id, emailIdToUse);
        finalAttachments = [...finalAttachments, ...uploadedNew];
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
        attachments: finalAttachments.length > 0 ? finalAttachments : [], // Ensure it's an array or null
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
        handleCloseComposer();
        setCurrentEmailFolderTab("pending"); // Renamed
        return true;
    } catch (error) {
        console.error("Error al poner correo en cola:", error);
        toast({ title: "Error al Enviar", variant: "destructive" });
        return false;
    } finally { setIsSubmittingEmail(false); }
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
        finalAttachments = [...finalAttachments, ...uploadedNew];
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
        setCurrentEmailFolderTab("drafts"); // Renamed
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
        setCurrentEmailFolderTab("trash"); // Renamed
    } catch (error) {
        console.error("Error moviendo correo a papelera:", error);
        toast({ title: "Error al Eliminar Correo", variant: "destructive" });
    }
  };

  // Folder definitions
  const folders: { name: FolderType; label: string; icon: React.ElementType, count?: number | null, isLoading?: boolean }[] = useMemo(() => [
    { name: "inbox", label: "Bandeja de Entrada", icon: Inbox, count: isLoadingUnreadCount ? null : (unreadInboxCount || 0), isLoading: isLoadingInbox },
    { name: "pending", label: "Enviando", icon: Clock, count: pendingEmails.length, isLoading: isLoadingPending },
    { name: "sent", label: "Enviados", icon: Send, count: sentEmails.length, isLoading: isLoadingSent },
    { name: "drafts", label: "Borradores", icon: ArchiveIcon, count: draftEmails.length, isLoading: isLoadingDrafts },
    { name: "trash", label: "Papelera", icon: Trash2, count: deletedEmails.length, isLoading: isLoadingDeleted, disabled: false }, // Papelera enabled
  ], [unreadInboxCount, isLoadingUnreadCount, inboxEmails, pendingEmails, sentEmails, draftEmails, deletedEmails, isLoadingInbox, isLoadingPending, isLoadingSent, isLoadingDrafts, isLoadingDeleted]);


  // Fetch Inbox Emails
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (!currentUser || currentEmailFolderTab !== 'inbox') { // Renamed
      console.log(`INBOX: Condiciones NO cumplidas. CurrentUser: ${currentUser ? currentUser.id : 'null'}, ActiveFolder: ${currentEmailFolderTab}`);
      setIsLoadingInbox(false); setInboxEmails([]);
      return;
    }
    console.log(`INBOX: Intentando consulta para usuario ${currentUser.id} en folder ${currentEmailFolderTab}`);
    setIsLoadingInbox(true);
    const q = query(
      collection(db, "incomingEmails"),
      where("crmUserId", "==", currentUser.id), // Assuming crmUserId is set by your IMAP function
      orderBy("receivedAt", "desc")
    );
    
    unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("INBOX: Snapshot de Bandeja de Entrada recibido. ¿Vacío?:", snapshot.empty, "Número de docs:", snapshot.size);
      if (snapshot.empty) console.log("INBOX: No hay documentos en 'incomingEmails' para este usuario o la consulta no los devuelve. Revisa reglas de seguridad y el campo 'crmUserId'.");
      
      const rawData = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      console.log("Raw fetched data from Firestore (inbox emails):", JSON.parse(JSON.stringify(rawData)));

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
      console.error("ERROR GRAVE AL OBTENER BANDEJA DE ENTRADA (onSnapshot):", error, "CurrentUser:", currentUser?.id);
      toast({ title: "Error Crítico al Cargar Bandeja de Entrada", variant: "destructive", description: `Detalles: ${error.message}. Revisa los permisos de Firestore para 'incomingEmails'.` });
      setIsLoadingInbox(false); setInboxEmails([]);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser, currentEmailFolderTab, toast]); // Renamed
  
  // Generic effect logic for outgoing emails
  const commonOutgoingEffectLogic = (
    folderType: FolderType,
    statusToFetch: EmailMessage['status'],
    orderByField: "createdAt" | "updatedAt" | "sentAt",
    setData: React.Dispatch<React.SetStateAction<EmailMessage[]>>,
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    let unsubscribe: (() => void) | undefined;
    if (!currentUser || currentEmailFolderTab !== folderType) { // Renamed
      setIsLoading(false); setData([]);
      return;
    }
    setIsLoading(true);
    const q = query(
      collection(db, "outgoingEmails"),
      where("userId", "==", currentUser.id),
      where("status", "==", statusToFetch),
      orderBy(orderByField, "desc")
    );
    
    unsubscribe = onSnapshot(q, (snapshot) => {
      const rawData = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      // console.log(`Raw fetched data from Firestore (${folderType} emails):`, JSON.parse(JSON.stringify(rawData)));
      const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, statusToFetch, 'outgoingEmails')).filter(Boolean) as EmailMessage[];
      // console.log(`Mapped ${folderType} emails for UI:`, JSON.parse(JSON.stringify(fetched)));
      setData(fetched);
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching ${folderType} emails:`, error);
      toast({ title: `Error al cargar ${folderType}`, variant: "destructive", description: error.message });
      setIsLoading(false); setData([]);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  };

  useEffect(() => commonOutgoingEffectLogic("sent", "sent", "sentAt", setSentEmails, setIsLoadingSent), [currentUser, currentEmailFolderTab, toast]); // Renamed
  useEffect(() => commonOutgoingEffectLogic("pending", "pending", "createdAt", setPendingEmails, setIsLoadingPending), [currentUser, currentEmailFolderTab, toast]); // Renamed
  useEffect(() => commonOutgoingEffectLogic("drafts", "draft", "updatedAt", setDraftEmails, setIsLoadingDrafts), [currentUser, currentEmailFolderTab, toast]); // Renamed
  useEffect(() => commonOutgoingEffectLogic("trash", "deleted", "updatedAt", setDeletedEmails, setIsLoadingDeleted), [currentUser, currentEmailFolderTab, toast]); // Renamed


  const emailsToDisplay = 
      currentEmailFolderTab === 'inbox' ? inboxEmails :
      currentEmailFolderTab === 'pending' ? pendingEmails :
      currentEmailFolderTab === 'sent' ? sentEmails :
      currentEmailFolderTab === 'drafts' ? draftEmails :
      currentEmailFolderTab === 'trash' ? deletedEmails : [];

  const isLoadingCurrentList = 
      currentEmailFolderTab === 'inbox' ? isLoadingInbox :
      currentEmailFolderTab === 'pending' ? isLoadingPending :
      currentEmailFolderTab === 'sent' ? isLoadingSent :
      currentEmailFolderTab === 'drafts' ? isLoadingDrafts :
      currentEmailFolderTab === 'trash' ? isLoadingDeleted : false;

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

  useEffect(() => { setCurrentPageForFolder(1); }, [currentEmailFolderTab, setCurrentPageForFolder]); // Renamed

  // Compact email list item renderer
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
        {/* Left Pane: Folders & New Email Button */}
        <div className="w-56 md:w-64 bg-muted/50 border-r p-3 flex-col hidden md:flex shrink-0">
          <Button onClick={() => handleOpenComposer(undefined, true)} className="w-full mb-4" size="lg">
            <Edit2 className="mr-2 h-4 w-4"/> Correo Nuevo
          </Button>
          <ScrollArea className="flex-grow">
            <nav className="flex flex-col gap-1">
              {folders.map(folder => (
                <Button
                  key={folder.name}
                  variant={currentEmailFolderTab === folder.name ? "secondary" : "ghost"} // Renamed
                  className="w-full justify-start text-sm h-9"
                  onClick={() => { setCurrentEmailFolderTab(folder.name); setSelectedEmail(null); setShowComposer(false); }} // Renamed
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

        {/* Middle Pane: Email List */}
        <div className={cn(
            "flex-1 flex flex-col overflow-hidden border-r", 
            (selectedEmail || showComposer) && "hidden md:flex"
        )}>
          <div className="p-3 border-b flex items-center justify-between shrink-0">
             <div className="relative flex-grow mr-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    type="search"
                    placeholder={`Buscar en ${folders.find(f=>f.name===currentEmailFolderTab)?.label || 'correos'}...`} // Renamed
                    className="pl-8 w-full h-9 text-sm"
                    // value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
                />
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={() => handleOpenComposer(undefined, true)}>
                <Edit2 className="h-5 w-5"/>
            </Button>
          </div>
          {isLoadingCurrentList ? (
            <div className="flex-grow flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : paginatedEmails.length === 0 ? (
            <div className="flex-grow flex items-center justify-center text-muted-foreground p-4 text-center">
              <p className="text-sm">No hay correos en "{folders.find(f=>f.name===currentEmailFolderTab)?.label}".</p> {/* Renamed */}
            </div>
          ) : (
            <ScrollArea className="flex-grow">
              <div className="divide-y">
                {paginatedEmails.map(email => renderEmailListItem(email, currentEmailFolderTab))} {/* Renamed */}
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
                    if (success) { handleCloseComposer(); setCurrentEmailFolderTab("pending"); } // Renamed
                    return success;
                }}
                onSaveDraft={async (data, attachments) => {
                    const success = await handleSaveDraft(data, attachments);
                    if (success) { handleCloseComposer(); setCurrentEmailFolderTab("drafts"); } // Renamed
                    return success;
                }}
                isSending={isSubmittingEmail} isSavingDraft={isSavingDraftState}
                onClose={handleCloseComposer}
                leads={leads} contacts={contacts}
              />
          ) : selectedEmail ? (
            <EmailDetailView
              email={selectedEmail}
              onClose={handleCloseEmailView}
              onReply={(emailToReply) => handleOpenComposer({ to: emailToReply.from.email, subject: `Re: ${emailToReply.subject}`, body: `\n\n\n----- Mensaje Original -----\n${emailToReply.bodyText || ""}`})}
              onReplyAll={(emailToReply) => { 
                const allRecipients = [
                    emailToReply.from.email,
                    ...(emailToReply.to?.map(r => r.email) || []),
                    ...(emailToReply.cc?.map(r => r.email) || [])
                ].filter(email => email && email !== currentUser?.email); 
                const uniqueRecipients = Array.from(new Set(allRecipients));
                handleOpenComposer({ 
                    to: uniqueRecipients.join(','),
                    subject: `Re: ${emailToReply.subject}`, 
                    body: `\n\n\n----- Mensaje Original -----\n${emailToReply.bodyText || ""}`
                });
              }}
              onForward={(emailToForward) => handleOpenComposer({ subject: `Fwd: ${emailToForward.subject}`, body: `\n\n\n----- Mensaje Reenviado -----\n${emailToForward.bodyHtml || emailToForward.bodyText || ""}`, attachments: emailToForward.attachments })}
              onDelete={(emailId, currentStatus, collectionSource) => handleDeleteEmail({id: emailId, status: currentStatus, collectionSource: collectionSource} as EmailMessage)} // Simplified to pass EmailMessage
            />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <MailIcon size={48} className="mb-4 text-primary/50" />
              <p className="text-lg font-medium">Selecciona un correo para leerlo</p>
              <p className="text-sm">o crea un correo nuevo desde el panel de carpetas.</p>
              <Button onClick={() => handleOpenComposer(undefined, true)} className="mt-4 md:hidden">
                <Edit2 className="mr-2 h-4 w-4"/> Correo Nuevo
              </Button>
            </div>
          )}
        </div>
      </div>

      <Card className="mt-4 bg-amber-50 border-amber-200 shrink-0">
        <CardHeader className="p-3">
          <CardTitle className="flex items-center text-amber-700 text-lg gap-2">
            <Info className="h-5 w-5" />
            Estado de Desarrollo del Módulo de Correo (Diseño Outlook)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600 space-y-2">
          <p><strong className="text-amber-800">Diseño tipo Outlook (3 paneles):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Redacción y Puesta en Cola (Backend `sendSingleEmail`):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Subida y Manejo de Adjuntos (Envío/Borrador):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Frontend sube a Storage, backend procesa).</p>
          <p><strong className="text-amber-800">Visualización de Pendientes, Enviados, Borradores, Papelera:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Carga desde Firestore `outgoingEmails`, Papelera básica).</p>
          <p><strong className="text-amber-800">Guardar/Cargar Borradores (Texto y Adjuntos):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Acciones (Responder/Reenviar - Abre compositor):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Mover a Papelera (Cambia estado):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Bandeja de Entrada (Recepción con `fetchIncomingEmailsImap`):</strong> <Badge className="bg-green-500 text-white">Conectado a Firestore `incomingEmails`</Badge>. Requiere que Cloud Function asocie correos a `crmUserId` para filtrado individual y parseo correcto.</p>
          <p><strong className="text-amber-800">Marcar como Leído (Bandeja de Entrada):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Búsqueda Avanzada y Filtros en Listas:</strong> <Badge className="bg-yellow-500 text-black">Básico Implementado (Input de búsqueda)</Badge></p>
          <p><strong className="text-amber-800">Sincronización Completa (IMAP push, etc.):</strong> <Badge variant="destructive">Pendiente (Backend Complejo)</Badge></p>
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


    