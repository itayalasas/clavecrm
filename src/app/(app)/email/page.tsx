
"use client";

import * as React from "react";
import { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc } from 'firebase/firestore';
import type { EmailMessage, OutgoingEmail, Lead, Contact, FirestoreTimestamp, User } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO, format, formatDistanceToNowStrict } from "date-fns";
import { es } from 'date-fns/locale';
import { EmailComposer } from "@/components/email/email-composer";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/lib/constants";
import { Mail as MailIcon, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit, Paperclip, UserPlus, XCircle, Folder, Edit2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 15; // Adjusted for a list view

type FolderType = "inbox" | "pending" | "sent" | "drafts" | "trash";

const parseFirestoreDateToISO = (fieldValue: any, fieldName?: string, docId?: string): string | undefined => {
  if (!fieldValue) return undefined;
  if (fieldValue instanceof Timestamp) return fieldValue.toDate().toISOString();
  if (typeof fieldValue === 'object' && typeof fieldValue.seconds === 'number' && typeof fieldValue.nanoseconds === 'number') {
    try {
      const dateFromObject = new Date(fieldValue.seconds * 1000 + fieldValue.nanoseconds / 1000000);
      if (isValid(dateFromObject)) return dateFromObject.toISOString();
    } catch (e) { console.warn(`Parse Date Error for ${fieldName} in doc ${docId}:`, e); }
  }
  if (typeof fieldValue === 'string') {
    const parsedDate = parseISO(fieldValue);
    if (isValid(parsedDate)) return parsedDate.toISOString();
    console.warn(`Invalid date string for '${fieldName}' in doc '${docId}':`, fieldValue);
  }
  console.warn(`Unexpected date format for '${fieldName}' in doc '${docId}':`, fieldValue, typeof fieldValue);
  return undefined;
};

const mapFirestoreDocToEmailMessage = (
  docSnap: any,
  currentUserIdParam: string | null,
  defaultStatus: EmailMessage['status'] = 'received',
  sourceCollection: 'incomingEmails' | 'outgoingEmails'
): EmailMessage | null => {
  const data = docSnap.data();
  if (!data) {
    console.warn(`mapFirestoreDocToEmailMessage: No data for document ${docSnap.id} from collection ${sourceCollection}`);
    return null;
  }

  let fromField: { name?: string; email: string } = { email: 'desconocido@sistema.com', name: 'Sistema' };
  if (data.from_parsed && Array.isArray(data.from_parsed) && data.from_parsed.length > 0 && data.from_parsed[0].address) {
    fromField = { email: data.from_parsed[0].address, name: data.from_parsed[0].name || undefined };
  } else if (typeof data.from === 'string') {
    const fromMatch = data.from.match(/^(.*?)\s*<([^>]+)>$/);
    if (fromMatch) fromField = { name: fromMatch[1].trim(), email: fromMatch[2].trim() };
    else if (data.from.includes('@')) fromField = { email: data.from.trim() };
    else fromField = { email: 'desconocido', name: data.from.trim() || 'Desconocido' };
  }

  let toRecipients: { name?: string; email: string }[] = [{ email: 'desconocido' }];
  if (data.to_parsed && Array.isArray(data.to_parsed) && data.to_parsed.length > 0) {
    toRecipients = data.to_parsed
      .map((t: any) => ({ email: t.address || 'desconocido', name: t.name || undefined }))
      .filter((t: any) => t.email && t.email !== 'desconocido');
  } else if (typeof data.to === 'string') {
    toRecipients = data.to.split(',')
      .map(emailStr => {
        const toMatch = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
        if (toMatch) return { name: toMatch[1].trim(), email: toMatch[2].trim() };
        if (emailStr.trim().includes('@')) return { email: emailStr.trim() };
        return { email: 'desconocido', name: emailStr.trim() || undefined };
      })
      .filter(t => t.email && t.email !== 'desconocido');
  }
  if (toRecipients.length === 0) toRecipients = [{ email: 'destinatario-desconocido' }];
  
  let ccRecipients: { name?: string; email: string }[] = [];
    if (data.cc_parsed && Array.isArray(data.cc_parsed) && data.cc_parsed.length > 0) {
        ccRecipients = data.cc_parsed.map((t: any) => ({ email: t.address || 'desconocido', name: t.name || undefined })).filter((t: any) => t.email && t.email !== 'desconocido');
    } else if (typeof data.cc === 'string') {
        ccRecipients = data.cc.split(',').map(emailStr => {
            const ccMatch = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
            return ccMatch ? { name: ccMatch[1].trim(), email: ccMatch[2].trim() } : (emailStr.trim().includes('@') ? { email: emailStr.trim() } : { email: 'desconocido' });
        }).filter(t => t.email && t.email !== 'desconocido');
    }

  let bccRecipients: { name?: string; email: string }[] = [];
    if (data.bcc_parsed && Array.isArray(data.bcc_parsed) && data.bcc_parsed.length > 0) {
        bccRecipients = data.bcc_parsed.map((t: any) => ({ email: t.address || 'desconocido', name: t.name || undefined })).filter((t: any) => t.email && t.email !== 'desconocido');
    } else if (typeof data.bcc === 'string') {
        bccRecipients = data.bcc.split(',').map(emailStr => {
            const bccMatch = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
            return bccMatch ? { name: bccMatch[1].trim(), email: bccMatch[2].trim() } : (emailStr.trim().includes('@') ? { email: emailStr.trim() } : { email: 'desconocido' });
        }).filter(t => t.email && t.email !== 'desconocido');
    }

  let mailDate: string = new Date(0).toISOString();
  let receivedAtDate: string | undefined;

  if (sourceCollection === 'incomingEmails') {
    mailDate = parseFirestoreDateToISO(data.date, 'date', docSnap.id) || new Date(0).toISOString();
    receivedAtDate = parseFirestoreDateToISO(data.receivedAt, 'receivedAt', docSnap.id);
  } else { // outgoingEmails
    const sentAtParsed = parseFirestoreDateToISO(data.sentAt, 'sentAt', docSnap.id);
    const createdAtParsed = parseFirestoreDateToISO(data.createdAt, 'createdAt', docSnap.id);
    mailDate = sentAtParsed || createdAtParsed || new Date(0).toISOString();
  }
  
  const currentUserId = currentUserIdParam || "system_user_fallback";
  let emailIsRead = typeof data.isRead === 'boolean' ? data.isRead : false; // Default to false
  if (sourceCollection !== 'incomingEmails') { // Sent, Drafts, etc. are considered "read" by the sender
    emailIsRead = true;
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
    bodyText: typeof data.text === 'string' ? data.text : "",
    status: data.status as EmailMessage['status'] || defaultStatus,
    userId: data.userId || currentUserId,
    attachments: Array.isArray(data.attachments) ? data.attachments.map((att:any) => ({ name: att.name || "adjunto", url: att.url || "#", size: att.size, type: att.type })) : [],
    isRead: emailIsRead,
    collectionSource: sourceCollection,
    threadId: data.threadId || undefined,
    relatedLeadId: data.relatedLeadId || undefined,
    relatedContactId: data.relatedContactId || undefined,
    relatedTicketId: data.relatedTicketId || undefined,
    crmUserId: data.crmUserId || undefined,
  };
};

function EmailPageContent() {
  const emailNavItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = emailNavItem?.icon || MailIcon;
  const { toast } = useToast();
  const { currentUser, unreadInboxCount } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeFolder, setActiveFolder] = useState<FolderType>("inbox");
  
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
  const [deletedEmails, setDeletedEmails] = useState<EmailMessage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [isLoadingSent, setIsLoadingSent] = useState(true);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(true);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const handleOpenComposer = useCallback((initialData: { to?: string, subject?: string, body?: string, attachments?: any[], draftId?: string | null, composerOpenedByButton?: boolean } = {}) => {
    setSelectedEmail(null);
    setComposerInitialTo(initialData.to || "");
    setComposerInitialSubject(decodeURIComponent(initialData.subject || ""));
    setComposerInitialBody(decodeURIComponent(initialData.body || ""));
    setComposerInitialAttachments(initialData.attachments || []);
    setEditingDraftId(initialData.draftId || null);
    setComposerKey(Date.now());
    setShowComposer(true);
    
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    const paramsExist = current.has('to') || current.has('subject') || current.has('body') || current.has('emailId');
    if (paramsExist && !initialData.composerOpenedByButton) {
        current.delete('to'); current.delete('subject'); current.delete('body'); current.delete('emailId');
        router.replace(`${pathname}?${current.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
    const fromUrlParams = searchParams.get("to") || searchParams.get("subject") || searchParams.get("body") || searchParams.get("emailId");
    if (fromUrlParams) {
        const current = new URLSearchParams(Array.from(searchParams.entries()));
        current.delete('to'); current.delete('subject'); current.delete('body'); current.delete('emailId');
        router.replace(`${pathname}?${current.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);
  
  const markEmailAsRead = async (emailId: string, collectionName: 'incomingEmails' | 'outgoingEmails') => {
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
            to: email.to.map(t => t.email).join(','),
            subject: email.subject,
            body: email.bodyHtml || email.bodyText,
            attachments: email.attachments,
            draftId: email.id,
            composerOpenedByButton: true,
        });
    } else {
        setSelectedEmail(email);
        setShowComposer(false);
        if (email.collectionSource === 'incomingEmails' && !email.isRead) {
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
        } catch (error) { console.error("Error fetching leads/contacts:", error); }
    };
    fetchLeadsAndContacts();
  }, []);

  useEffect(() => {
    const toParam = searchParams.get("to");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId");

    if (emailIdParam && !showComposer && !selectedEmail) {
      const findEmail = (id: string, list: EmailMessage[]) => list.find(e => e.id === id);
      let emailToView = findEmail(emailIdParam, sentEmails) || findEmail(emailIdParam, pendingEmails) || findEmail(emailIdParam, inboxEmails) || findEmail(emailIdParam, draftEmails) || findEmail(emailIdParam, deletedEmails);
      if (emailToView) handleViewEmail(emailToView);
    } else if ((toParam || subjectParam || bodyParam) && !editingDraftId && !selectedEmail && !showComposer) {
      handleOpenComposer({ to: toParam || "", subject: subjectParam || "", body: bodyParam || "" });
    }
  }, [searchParams, handleOpenComposer, sentEmails, pendingEmails, inboxEmails, draftEmails, deletedEmails, showComposer, editingDraftId, selectedEmail]);

  const uploadAttachments = async (files: File[], userId: string, emailId: string): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    const attachmentPromises = files.map(file => {
        const filePath = `email-attachments/${userId}/${emailId}/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, filePath);
        const uploadTask = uploadBytesResumable(fileRef, file);
        return new Promise<{ name: string; url: string; size: number; type: string }>((resolve, reject) => {
            uploadTask.on("state_changed", null, 
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
    const emailIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id;
    let finalAttachments = editingDraftId ? (draftEmails.find(d => d.id === editingDraftId)?.attachments || []) : [];
    
    if (newAttachments.length > 0) {
        const uploadedNew = await uploadAttachments(newAttachments, currentUser.id, emailIdToUse);
        finalAttachments = [...finalAttachments, ...uploadedNew];
    }

    const emailDoc: Partial<OutgoingEmail> = {
        to: data.to, cc: data.cc || null, bcc: data.bcc || null, subject: data.subject,
        bodyHtml: data.body, status: "pending", userId: currentUser.id,
        fromName: currentUser.name || "Usuario CRM", fromEmail: currentUser.email,
        attachments: finalAttachments, updatedAt: serverTimestamp(),
    };

    try {
        if (editingDraftId) {
            const draftBeingSent = draftEmails.find(d => d.id === editingDraftId);
            await updateDoc(doc(db, "outgoingEmails", editingDraftId), {
                ...emailDoc,
                createdAt: draftBeingSent?.date ? Timestamp.fromDate(new Date(draftBeingSent.date)) : serverTimestamp(),
            });
        } else {
            await setDoc(doc(db, "outgoingEmails", emailIdToUse), { ...emailDoc, createdAt: serverTimestamp() });
        }
        toast({ title: "Correo en Cola", description: `Tu correo para ${data.to} se enviará pronto.` });
        if (editingDraftId) setEditingDraftId(null);
        handleCloseComposer();
        setActiveFolder("pending");
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
    setIsSavingDraft(true);
    const draftIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id;
    let finalAttachments = editingDraftId ? (composerInitialAttachments || []) : [];

    if (newAttachments.length > 0) {
        const uploadedNew = await uploadAttachments(newAttachments, currentUser.id, draftIdToUse);
        finalAttachments = [...finalAttachments, ...uploadedNew];
    }

    const draftDoc: Partial<OutgoingEmail> = { 
        to: data.to, cc: data.cc || null, bcc: data.bcc || null, subject: data.subject,
        bodyHtml: data.body, status: "draft", userId: currentUser.id,
        fromName: currentUser.name || "Usuario CRM", fromEmail: currentUser.email,
        attachments: finalAttachments, updatedAt: serverTimestamp(),
    };
    try {
        if (editingDraftId) {
            await updateDoc(doc(db, "outgoingEmails", editingDraftId), draftDoc);
        } else {
            await setDoc(doc(db, "outgoingEmails", draftIdToUse), { ...draftDoc, createdAt: serverTimestamp() });
        }
        toast({ title: "Borrador Guardado"});
        if (editingDraftId) setEditingDraftId(null);
        handleCloseComposer();
        setActiveFolder("drafts");
        return true;
    } catch (error) {
        console.error("Error al guardar borrador:", error);
        toast({ title: "Error al Guardar Borrador", variant: "destructive" });
        return false;
    } finally { setIsSavingDraft(false); }
  };
  
  const handleDeleteEmail = async (emailId: string, currentStatus: EmailMessage['status'], collectionSource: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser || !emailId) return;
    if (!window.confirm("¿Estás seguro de que quieres mover este correo a la papelera?")) return;
    try {
        await updateDoc(doc(db, collectionSource, emailId), { status: "deleted", updatedAt: serverTimestamp() });
        toast({ title: "Correo Movido a Papelera" });
        if (selectedEmail?.id === emailId) setSelectedEmail(null);
        setActiveFolder("trash");
    } catch (error) {
        console.error("Error moviendo correo a papelera:", error);
        toast({ title: "Error al Eliminar Correo", variant: "destructive" });
    }
  };

  // Fetch Inbox Emails
  useEffect(() => {
    if (!currentUser || activeFolder !== 'inbox') {
      setIsLoadingInbox(false); setInboxEmails([]); return;
    }
    console.log(`INBOX: Intentando consulta para usuario ${currentUser.id} en pestaña ${activeFolder}`);
    setIsLoadingInbox(true);
    const q = query(collection(db, "incomingEmails"), where("crmUserId", "==", currentUser.id), orderBy("receivedAt", "desc"));
    console.log("INBOX: Firestore Query (conceptual):", "collection('incomingEmails').where('crmUserId', '==', currentUser.id).orderBy('receivedAt', 'desc')");
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("INBOX: Snapshot de Bandeja de Entrada recibido. ¿Vacío?:", snapshot.empty, "Número de docs:", snapshot.size);
      if (snapshot.empty) console.log("INBOX: No hay documentos o la consulta no los devuelve. Verifica reglas de seguridad o si la colección 'incomingEmails' está vacía/no tiene campo 'crmUserId'.");
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
      console.log("Mapped inbox emails for UI:", fetched);
      setInboxEmails(fetched);
      setIsLoadingInbox(false);
    }, (error) => {
      console.error("ERROR GRAVE AL OBTENER BANDEJA DE ENTRADA (onSnapshot):", error);
      toast({ title: "Error Crítico al Cargar Bandeja de Entrada", variant: "destructive", description: `Detalles: ${error.message}. Revisa los permisos de Firestore para 'incomingEmails'.` });
      setIsLoadingInbox(false); setInboxEmails([]);
    });
    return () => unsubscribe();
  }, [currentUser, activeFolder, toast]); 

  // Fetch other email lists (Sent, Pending, Drafts, Deleted)
  useEffect(() => {
    if (!currentUser) {
      setSentEmails([]); setPendingEmails([]); setDraftEmails([]); setDeletedEmails([]);
      setIsLoadingSent(false); setIsLoadingPending(false); setIsLoadingDrafts(false); setIsLoadingDeleted(false);
      return;
    }
    const listConfig: {
      folder: FolderType;
      status: EmailMessage['status'];
      setter: React.Dispatch<React.SetStateAction<EmailMessage[]>>;
      loaderSetter: React.Dispatch<React.SetStateAction<boolean>>;
      orderByField?: "createdAt" | "updatedAt";
    }[] = [
      { folder: "sent", status: "sent", setter: setSentEmails, loaderSetter: setIsLoadingSent, orderByField: "sentAt" },
      { folder: "pending", status: "pending", setter: setPendingEmails, loaderSetter: setIsLoadingPending },
      { folder: "drafts", status: "draft", setter: setDraftEmails, loaderSetter: setIsLoadingDrafts, orderByField: "updatedAt" },
      { folder: "trash", status: "deleted", setter: setDeletedEmails, loaderSetter: setIsLoadingDeleted, orderByField: "updatedAt" },
    ];

    const unsubscribes: (()=>void)[] = [];

    listConfig.forEach(config => {
      if (activeFolder === config.folder) {
        config.loaderSetter(true);
        const q = query(
          collection(db, "outgoingEmails"),
          where("userId", "==", currentUser.id),
          where("status", "==", config.status),
          orderBy(config.orderByField || "createdAt", "desc")
        );
        console.log(`${config.folder.toUpperCase()}: Subscribing for user ${currentUser.id}`);
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const raw = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
          console.log(`Raw fetched data from Firestore (${config.folder} emails):`, JSON.parse(JSON.stringify(raw)));
          const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, config.status, 'outgoingEmails')).filter(Boolean) as EmailMessage[];
          console.log(`Mapped ${config.folder} emails for UI:`, fetched);
          config.setter(fetched);
          config.loaderSetter(false);
        }, (error) => {
          console.error(`Error fetching ${config.folder} emails:`, error);
          toast({ title: `Error al cargar ${config.label || config.folder}`, variant: "destructive", description: error.message });
          config.loaderSetter(false);
          config.setter([]);
        });
        unsubscribes.push(unsubscribe);
      } else {
        config.loaderSetter(false); // Ensure loader is off for inactive tabs
        // config.setter([]); // Optionally clear data for inactive tabs
      }
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [currentUser, activeFolder, toast]);

  const folders: { name: FolderType; label: string; icon: React.ElementType, emails: EmailMessage[], isLoading: boolean, count?: number }[] = [
    { name: "inbox", label: "Bandeja de Entrada", icon: Inbox, emails: inboxEmails, isLoading: isLoadingInbox, count: unreadInboxCount || 0 },
    { name: "pending", label: "Enviando", icon: Clock, emails: pendingEmails, isLoading: isLoadingPending, count: pendingEmails.length },
    { name: "sent", label: "Enviados", icon: Send, emails: sentEmails, isLoading: isLoadingSent },
    { name: "drafts", label: "Borradores", icon: ArchiveIcon, emails: draftEmails, isLoading: isLoadingDrafts, count: draftEmails.length },
    { name: "trash", label: "Papelera", icon: Trash2, emails: deletedEmails, isLoading: isLoadingDeleted },
  ];

  const currentFolderData = folders.find(f => f.name === activeFolder);
  const emailsToDisplay = currentFolderData?.emails || [];
  const isLoadingCurrentList = currentFolderData?.isLoading || false;

  const totalPages = Math.ceil(emailsToDisplay.length / ITEMS_PER_PAGE);
  const paginatedEmails = emailsToDisplay.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [activeFolder]); // Reset page on folder change

  if (showComposer) {
    return (
        <div className="flex flex-col h-full p-4">
            <EmailComposer
                key={composerKey}
                initialTo={composerInitialTo} initialSubject={composerInitialSubject} initialBody={composerInitialBody}
                initialAttachments={composerInitialAttachments}
                onQueueEmail={handleQueueEmailForSending}
                onSaveDraft={handleSaveDraft}
                isSending={isSubmittingEmail} isSavingDraft={isSavingDraft}
                onClose={handleCloseComposer}
                leads={leads} contacts={contacts}
            />
        </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Card className="shadow-lg shrink-0 rounded-none border-0 border-b">
        <CardHeader className="p-3 md:p-4">
            <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
                <PageIcon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                {emailNavItem?.label || "Correo Electrónico"}
            </CardTitle>
        </CardHeader>
      </Card>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Folders */}
        <div className="w-56 md:w-64 bg-muted/50 border-r p-3 flex flex-col">
          <Button onClick={() => handleOpenComposer({ composerOpenedByButton: true })} className="w-full mb-4" size="lg">
            <Edit2 className="mr-2 h-4 w-4"/> Correo Nuevo
          </Button>
          <ScrollArea className="flex-grow">
            <nav className="flex flex-col gap-1">
              {folders.map(folder => (
                <Button
                  key={folder.name}
                  variant={activeFolder === folder.name ? "default" : "ghost"}
                  className="w-full justify-start text-sm"
                  onClick={() => { setActiveFolder(folder.name); setSelectedEmail(null); }}
                >
                  <folder.icon className={cn("mr-2 h-4 w-4", activeFolder === folder.name ? "" : "text-muted-foreground")} />
                  {folder.label}
                  {folder.count !== undefined && folder.count > 0 && (
                    <Badge 
                      className={cn(
                        "ml-auto text-xs px-1.5 py-0.5",
                        folder.name === 'inbox' && folder.count > 0 ? "bg-red-500 text-white" : 
                        folder.name === 'drafts' && folder.count > 0 ? "bg-primary/20 text-primary-foreground" : 
                        "bg-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      {folder.count}
                    </Badge>
                  )}
                </Button>
              ))}
            </nav>
          </ScrollArea>
        </div>

        {/* Middle Pane: Email List */}
        <div className="flex-1 flex flex-col overflow-hidden border-r">
          <div className="p-3 border-b">
            <Input placeholder={`Buscar en ${folders.find(f=>f.name===activeFolder)?.label || 'correos'}...`} className="h-9 text-sm"/>
          </div>
          {isLoadingCurrentList ? (
            <div className="flex-grow flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : paginatedEmails.length === 0 ? (
            <div className="flex-grow flex items-center justify-center text-muted-foreground p-4 text-center">
              <p className="text-sm">No hay correos en "{folders.find(f=>f.name===activeFolder)?.label}".</p>
            </div>
          ) : (
            <ScrollArea className="flex-grow">
              <div className="divide-y">
                {paginatedEmails.map(email => (
                  <button
                    key={email.id}
                    className={cn(
                        "w-full text-left p-3 hover:bg-accent focus-visible:bg-accent outline-none",
                        selectedEmail?.id === email.id && "bg-primary/10",
                        !email.isRead && activeFolder === 'inbox' && "font-semibold border-l-2 border-primary"
                    )}
                    onClick={() => handleViewEmail(email)}
                  >
                    <div className="flex justify-between items-center text-xs mb-0.5">
                      <p className={cn("truncate max-w-[150px] md:max-w-[200px]", !email.isRead && activeFolder === 'inbox' ? "text-primary" : "text-foreground")}>
                        {activeFolder === 'sent' || activeFolder === 'pending' || activeFolder === 'drafts' 
                         ? `Para: ${email.to.map(t=>t.name || t.email).join(', ')}` 
                         : (email.from.name || email.from.email)}
                      </p>
                      <time className="text-muted-foreground text-[11px] shrink-0">
                        {isValid(parseISO(email.date)) ? formatDistanceToNowStrict(parseISO(email.date), { addSuffix: true, locale: es}) : "Fecha Inv."}
                      </time>
                    </div>
                    <p className={cn("text-sm truncate", !email.isRead && activeFolder === 'inbox' ? "text-primary" : "")}>
                        {email.subject || "(Sin Asunto)"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {email.bodyText?.substring(0, 70) || (email.bodyHtml ? "Contenido HTML..." : "(Sin contenido)")}
                    </p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
           {totalPages > 1 && (
            <div className="p-2 border-t flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }} disabled={currentPage === 1} /></PaginationItem>
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      let pageNum = currentPage <= 3 ? i + 1 : (currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i);
                      if (pageNum < 1 || pageNum > totalPages) return null;
                      return <PaginationItem key={pageNum}><PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(pageNum); }} isActive={currentPage === pageNum}>{pageNum}</PaginationLink></PaginationItem>;
                  })}
                  {totalPages > 5 && currentPage < totalPages - 2 && <PaginationItem><PaginationLink>...</PaginationLink></PaginationItem>}
                  <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }} disabled={currentPage === totalPages} /></PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>

        {/* Right Pane: Email Detail or Composer */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {selectedEmail && !showComposer ? (
            <EmailDetailView
              email={selectedEmail}
              onClose={handleCloseEmailView}
              onReply={(emailToReply) => handleOpenComposer({ to: emailToReply.from.email, subject: `Re: ${emailToReply.subject}`, body: `\n\n\n----- Mensaje Original -----\n${emailToReply.bodyText}`})}
              onReplyAll={(emailToReply) => { /* TODO */ console.log("Reply All:", emailToReply); }}
              onForward={(emailToForward) => handleOpenComposer({ subject: `Fwd: ${emailToForward.subject}`, body: `\n\n\n----- Mensaje Reenviado -----\n${emailToForward.bodyHtml || emailToForward.bodyText}`, attachments: emailToForward.attachments })}
              onDelete={(emailId, currentStatus) => handleDeleteEmail(emailId, currentStatus, emailsToDisplay.find(e=>e.id === emailId)?.collectionSource || 'outgoingEmails')}
            />
          ) : !selectedEmail && !showComposer ? (
            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <MailIcon size={48} className="mb-4 text-primary/50" />
              <p className="text-lg font-medium">Selecciona un correo para leerlo</p>
              <p className="text-sm">o crea un correo nuevo.</p>
            </div>
          ) : null /* Composer is handled outside this pane directly by EmailPageContent if showComposer is true */}
        </div>
      </div>

      <Card className="mt-4 bg-amber-50 border-amber-200 shrink-0">
        <CardHeader className="p-3">
          <CardTitle className="flex items-center text-amber-700 text-lg gap-2">
            <Info className="h-5 w-5" />
            Estado de Desarrollo del Módulo de Correo
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600 space-y-1">
          <p><strong className="text-amber-800">Diseño tipo Outlook:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Redacción y Puesta en Cola (Backend `sendSingleEmail`):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Subida y Manejo de Adjuntos (Envío/Borrador):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Visualización de Pendientes, Enviados, Borradores, Papelera:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Guardar/Cargar Borradores con Adjuntos:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Acciones (Responder/Reenviar - Abre compositor):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Bandeja de Entrada (Recepción con `fetchIncomingEmailsImap`):</strong> <Badge className="bg-green-500 text-white">Conectado a Firestore `incomingEmails`</Badge>. Se requiere que la Cloud Function asocie correos a `crmUserId`.</p>
          <p><strong className="text-amber-800">Marcar como Leído (Bandeja de Entrada):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Búsqueda Avanzada y Filtros en Listas:</strong> <Badge className="bg-yellow-500 text-black">En Desarrollo</Badge></p>
          <p><strong className="text-amber-800">Sincronización Completa (IMAP push, etc.):</strong> <Badge variant="destructive">Pendiente (Backend Complejo)</Badge></p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmailPage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-6 h-full"><Skeleton className="h-16 w-full shrink-0" /><div className="flex flex-1 overflow-hidden"><Skeleton className="w-64 border-r"/><Skeleton className="flex-1 border-r"/><Skeleton className="flex-1"/></div></div>}>
      <EmailPageContent />
    </Suspense>
  );
}
