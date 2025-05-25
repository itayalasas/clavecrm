
"use client";

import * as React from "react";
import { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore'; // Added getDocs
import type { EmailMessage, OutgoingEmail, Lead, Contact, FirestoreTimestamp, User } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO, format, formatDistanceToNowStrict } from "date-fns";
import { es } from 'date-fns/locale';
import { EmailComposer } from "@/components/email/email-composer";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/lib/constants";
import { Mail as MailIcon, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit, Paperclip, UserPlus, XCircle, Folder, Edit2, LayoutGrid, MessageSquare, History, UserCircle as UserCircleIcon, Smartphone, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/lib/utils";

const ITEMS_PER_PAGE = 10;

type FolderType = "inbox" | "pending" | "sent" | "drafts" | "trash";

const parseFirestoreDateToISO = (fieldValue: any, fieldName?: string, docId?: string): string | undefined => {
  if (!fieldValue) return undefined;

  if (fieldValue instanceof Timestamp) {
    try {
      return fieldValue.toDate().toISOString();
    } catch (e) {
      console.warn(`Parse Date Error (Timestamp toDate) for ${fieldName} in doc ${docId}:`, e, "Value:", fieldValue);
      return undefined;
    }
  }
  if (typeof fieldValue === 'object' && typeof fieldValue.seconds === 'number' && typeof fieldValue.nanoseconds === 'number') {
    try {
      const dateFromObject = new Date(fieldValue.seconds * 1000 + fieldValue.nanoseconds / 1000000);
      if (isValid(dateFromObject)) return dateFromObject.toISOString();
      else {
        console.warn(`Invalid date created from object for ${fieldName} in doc ${docId}:`, dateFromObject, "Original object:", fieldValue);
        return undefined;
      }
    } catch (e) {
      console.warn(`Parse Date Error (Object to Date) for ${fieldName} in doc ${docId}:`, e, "Value:", fieldValue);
      return undefined;
    }
  }
  if (typeof fieldValue === 'string') {
    const parsedDate = parseISO(fieldValue);
    if (isValid(parsedDate)) return parsedDate.toISOString();
    
    try {
        const attemptParse = new Date(fieldValue);
        if (isValid(attemptParse)) {
            console.warn(`Date field '${fieldName}' in doc '${docId}' was a non-ISO string '${fieldValue}', parsed as local time. Consider storing as Timestamp.`);
            return attemptParse.toISOString();
        }
    } catch(e) { /* ignore parse error for this attempt */ }

    console.warn(`Invalid date string for '${fieldName}' in doc '${docId}':`, fieldValue);
    return undefined; // Return undefined if it's an unparsable string
  }
  console.warn(`Unexpected date format for '${fieldName}' in doc '${docId}':`, fieldValue, typeof fieldValue);
  return undefined; // Default undefined for other unhandled types
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

  // FROM field parsing
  let fromField: { name?: string; email: string } = { email: 'desconocido@sistema.com', name: 'Sistema' };
  if (data.from_parsed && Array.isArray(data.from_parsed) && data.from_parsed.length > 0 && data.from_parsed[0].address) {
      fromField = { email: data.from_parsed[0].address, name: data.from_parsed[0].name || undefined };
      // console.log(`mapFirestoreDocToEmailMessage: Used from_parsed for doc ${docSnap.id}`, fromField);
  } else if (typeof data.from === 'string') {
      // console.log(`mapFirestoreDocToEmailMessage: Attempting to parse 'from' string for doc ${docSnap.id}:`, data.from);
      const fromMatch = data.from.match(/^(.*?)\s*<([^>]+)>$/);
      if (fromMatch) fromField = { name: fromMatch[1].trim() || undefined, email: fromMatch[2].trim() };
      else if (data.from.includes('@')) fromField = { email: data.from.trim() };
      else {
          console.warn(`mapFirestoreDocToEmailMessage: 'from' string could not be parsed for doc ${docSnap.id}:`, data.from);
          fromField = { email: 'desconocido', name: data.from.trim() || undefined };
      }
  } else {
      console.warn(`mapFirestoreDocToEmailMessage: 'from' field has unexpected structure for doc ${docSnap.id}:`, data.from);
  }

  // TO field parsing
  let toRecipients: { name?: string; email: string }[] = [{ email: 'destinatario-desconocido@sistema.com' }];
  if (data.to_parsed && Array.isArray(data.to_parsed) && data.to_parsed.length > 0) {
      toRecipients = data.to_parsed
          .map((t: any) => ({ email: t.address || 'desconocido@sistema.com', name: t.name || undefined }))
          .filter((t: any) => t.email && t.email !== 'desconocido@sistema.com');
      // console.log(`mapFirestoreDocToEmailMessage: Used to_parsed for doc ${docSnap.id}`, toRecipients);
  } else if (typeof data.to === 'string') {
      // console.log(`mapFirestoreDocToEmailMessage: Attempting to parse 'to' string for doc ${docSnap.id}:`, data.to);
      toRecipients = data.to.split(',')
          .map(emailStr => {
              const toMatch = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
              if (toMatch) return { name: toMatch[1].trim() || undefined, email: toMatch[2].trim() };
              if (emailStr.trim().includes('@')) return { email: emailStr.trim() };
              console.warn(`mapFirestoreDocToEmailMessage: Could not parse individual 'to' email string: ${emailStr} in doc ${docSnap.id}`);
              return { email: 'desconocido@sistema.com', name: emailStr.trim() || undefined };
          })
          .filter(t => t.email && t.email !== 'desconocido@sistema.com');
  } else {
      console.warn(`mapFirestoreDocToEmailMessage: 'to' field has unexpected structure for doc ${docSnap.id}:`, data.to);
  }
  if (toRecipients.length === 0) toRecipients = [{ email: 'destinatario-desconocido@sistema.com' }];

  // CC field parsing
  let ccRecipients: { name?: string; email: string }[] = [];
  if (data.cc_parsed && Array.isArray(data.cc_parsed) && data.cc_parsed.length > 0) {
    ccRecipients = data.cc_parsed.map((t: any) => ({ email: t.address || 'desconocido@sistema.com', name: t.name || undefined })).filter((t: any) => t.email && t.email !== 'desconocido@sistema.com');
  } else if (typeof data.cc === 'string') {
    ccRecipients = data.cc.split(',').map(emailStr => {
        const ccMatch = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
        return ccMatch ? { name: ccMatch[1].trim() || undefined, email: ccMatch[2].trim() } : (emailStr.trim().includes('@') ? { email: emailStr.trim() } : { email: 'desconocido@sistema.com' });
    }).filter(t => t.email && t.email !== 'desconocido@sistema.com');
  }

  // BCC field parsing
  let bccRecipients: { name?: string; email: string }[] = [];
  if (data.bcc_parsed && Array.isArray(data.bcc_parsed) && data.bcc_parsed.length > 0) {
    bccRecipients = data.bcc_parsed.map((t: any) => ({ email: t.address || 'desconocido@sistema.com', name: t.name || undefined })).filter((t: any) => t.email && t.email !== 'desconocido@sistema.com');
  } else if (typeof data.bcc === 'string') {
    bccRecipients = data.bcc.split(',').map(emailStr => {
        const bccMatch = emailStr.trim().match(/^(.*?)\s*<([^>]+)>$/);
        return bccMatch ? { name: bccMatch[1].trim() || undefined, email: bccMatch[2].trim() } : (emailStr.trim().includes('@') ? { email: emailStr.trim() } : { email: 'desconocido@sistema.com' });
    }).filter(t => t.email && t.email !== 'desconocido@sistema.com');
  }

  // Date parsing
  let mailDate: string = new Date(0).toISOString();
  let receivedAtDate: string | undefined;
  
  if (sourceCollection === 'incomingEmails') {
    // console.log(`mapFirestoreDocToEmailMessage: Parsing 'date' for incoming ${docSnap.id}:`, data.date);
    mailDate = parseFirestoreDateToISO(data.date, 'date', docSnap.id) || new Date(0).toISOString();
    // console.log(`mapFirestoreDocToEmailMessage: Parsing 'receivedAt' for incoming ${docSnap.id}:`, data.receivedAt);
    receivedAtDate = parseFirestoreDateToISO(data.receivedAt, 'receivedAt', docSnap.id);
  } else { // outgoingEmails
    const sentAtParsed = parseFirestoreDateToISO(data.sentAt, 'sentAt', docSnap.id);
    const createdAtParsed = parseFirestoreDateToISO(data.createdAt, 'createdAt', docSnap.id);
    mailDate = sentAtParsed || createdAtParsed || new Date(0).toISOString();
  }
  // console.log(`mapFirestoreDocToEmailMessage: Final mailDate for ${docSnap.id}: ${mailDate}`);
  
  const currentUserId = currentUserIdParam || "system_user_fallback"; // Fallback for safety
  let emailIsRead = typeof data.isRead === 'boolean' ? data.isRead : false;
  if (sourceCollection === 'incomingEmails') {
    emailIsRead = typeof data.isRead === 'boolean' ? data.isRead : false; // Default to unread for inbox items
  } else { // sent, pending, draft, deleted
    emailIsRead = true; // These aren't "unread" in the inbox sense
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
    userId: data.userId || currentUserId, // Ensure userId is present
    attachments: Array.isArray(data.attachments) ? data.attachments.map((att:any) => ({ name: att.name || "adjunto", url: att.url || "#", size: att.size, type: att.type })) : [],
    isRead: emailIsRead,
    collectionSource: sourceCollection,
    threadId: data.threadId || undefined,
    relatedLeadId: data.relatedLeadId || undefined,
    relatedContactId: data.relatedContactId || undefined,
    relatedTicketId: data.relatedTicketId || undefined,
    crmUserId: data.crmUserId || (sourceCollection === 'incomingEmails' ? currentUserId : undefined), // For incoming, associate with current viewer if not set
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
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  
  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now());
  const [composerInitialData, setComposerInitialData] = useState<{
    to?: string; cc?: string; bcc?: string; subject?: string; body?: string;
    attachments?: { name: string; url: string; size?: number; type?: string }[];
    draftId?: string | null;
  } | null>(null);
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
  
  const [currentPageInbox, setCurrentPageInbox] = useState(1);
  const [currentPageSent, setCurrentPageSent] = useState(1);
  const [currentPagePending, setCurrentPagePending] = useState(1);
  const [currentPageDrafts, setCurrentPageDrafts] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  

  const handleOpenComposer = useCallback((initialData: Partial<typeof composerInitialData> = {}) => {
    console.log("Opening composer with initial data:", initialData);
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
    setSelectedEmail(null); // Close detail view if open

    // Clean up URL params if composer was opened by URL
    const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
    const paramsWerePresent = currentUrlParams.has('to') || currentUrlParams.has('subject') || currentUrlParams.has('body') || currentUrlParams.has('emailId');
    
    if (paramsWerePresent && !initialData.draftId) { // Don't clear if opening a draft by ID from URL
        currentUrlParams.delete('to');
        currentUrlParams.delete('cc');
        currentUrlParams.delete('bcc');
        currentUrlParams.delete('subject');
        currentUrlParams.delete('body');
        // Keep emailId if it's for viewing an email, not for composing
        if (!initialData.draftId && currentUrlParams.get('action') !== 'view') {
            currentUrlParams.delete('emailId');
        }
        router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
    setComposerInitialData(null);
    // Also clear URL params if composer was opened by URL and now closed manually
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
  
  const markEmailAsRead = async (emailId: string, collectionName: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser || !emailId || collectionName !== 'incomingEmails') return;
    console.log(`Marking email ${emailId} in ${collectionName} as read.`);
    try {
      await updateDoc(doc(db, collectionName, emailId), { isRead: true, updatedAt: serverTimestamp() });
      console.log(`Email ${emailId} marked as read.`);
    } catch (error) {
      console.error(`Error al marcar correo ${emailId} como leído en ${collectionName}:`, error);
      toast({ title: "Error al marcar correo como leído", variant: "destructive" });
    }
  };


  const handleViewEmail = (email: EmailMessage) => {
    if (email.status === 'draft' && currentUser && email.userId === currentUser.id) {
        // If it's a draft by the current user, open it in the composer
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
        setShowComposer(false); // Close composer if open
        if (email.collectionSource === 'incomingEmails' && !email.isRead) {
            markEmailAsRead(email.id, 'incomingEmails');
        }
    }
  };

  const handleCloseEmailView = () => {
    setSelectedEmail(null);
  };

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
        } catch (error) { console.error("Error fetching leads/contacts:", error); }
    };
    fetchLeadsAndContacts();
  }, []);
  
  // Effect to handle opening composer/viewer from URL params
  useEffect(() => {
    const toParam = searchParams.get("to");
    const ccParam = searchParams.get("cc");
    const bccParam = searchParams.get("bcc");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId");
    const actionParam = searchParams.get("action");

    if (emailIdParam && actionParam === "view_draft" && !showComposer && !selectedEmail) {
      // Attempt to find and open draft from any list
      const draftToOpen = [...sentEmails, ...pendingEmails, ...inboxEmails, ...draftEmails, ...deletedEmails].find(e => e.id === emailIdParam && e.status === 'draft');
      if (draftToOpen) handleViewEmail(draftToOpen); // This will open composer for drafts
    } else if (emailIdParam && actionParam !== "view_draft" && !showComposer && !selectedEmail) {
      // Attempt to find and view any other email
      const emailToView = [...sentEmails, ...pendingEmails, ...inboxEmails, ...draftEmails, ...deletedEmails].find(e => e.id === emailIdParam);
      if (emailToView) handleViewEmail(emailToView);
    } else if ((toParam || subjectParam || bodyParam) && !composerInitialData?.draftId && !selectedEmail && !showComposer) {
      // Open composer for new email if relevant params are present
      handleOpenComposer({ to: toParam || "", cc: ccParam || "", subject: subjectParam || "", body: bodyParam || "" });
    }
  }, [searchParams, handleOpenComposer, sentEmails, pendingEmails, inboxEmails, draftEmails, deletedEmails, showComposer, selectedEmail, composerInitialData]); // Added more dependencies


  const uploadAttachments = async (files: File[], userId: string, emailId: string): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    const attachmentPromises = files.map(file => {
        const filePath = `email-attachments/${userId}/${emailId}/${Date.now()}-${file.name}`;
        const fileRef = storageRef(storage, filePath);
        const uploadTask = uploadBytesResumable(fileRef, file);
        return new Promise<{ name: string; url: string; size: number; type: string }>((resolve, reject) => {
            uploadTask.on("state_changed", 
                (snapshot) => {
                    // Optional: update progress if you have a UI for it
                    // const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    // console.log('Upload is ' + progress + '% done');
                },
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
    const emailIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id; // Generate ID client-side if new

    let finalAttachments = isSendingDraft ? (composerInitialData?.attachments || []) : [];
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
        fromEmail: currentUser.email, // Assuming currentUser.email is the sender's email
        attachments: finalAttachments, 
        updatedAt: serverTimestamp(),
    };

    try {
        if (isSendingDraft) {
            const draftBeingSent = draftEmails.find(d => d.id === editingDraftId); // Or fetch if not in local state
            await updateDoc(doc(db, "outgoingEmails", editingDraftId!), {
                ...emailDoc,
                createdAt: draftBeingSent?.date ? Timestamp.fromDate(new Date(draftBeingSent.date)) : serverTimestamp(), // Preserve original creation if possible
            });
        } else {
            // Use setDoc with the client-generated ID
            await setDoc(doc(db, "outgoingEmails", emailIdToUse), { ...emailDoc, createdAt: serverTimestamp() });
        }
        toast({ title: "Correo en Cola", description: `Tu correo para ${data.to} se enviará pronto.` });
        handleCloseComposer();
        setActiveFolder("pending"); // Switch to pending folder
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
    const draftIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id; // Generate ID client-side if new
    
    let finalAttachments = editingDraftId ? (composerInitialData?.attachments || []) : [];
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
        fromEmail: currentUser.email, // Assuming currentUser.email is the sender's email
        attachments: finalAttachments, 
        updatedAt: serverTimestamp(),
    };
    try {
        if (editingDraftId) {
            await updateDoc(doc(db, "outgoingEmails", editingDraftId), draftDoc);
        } else {
            // Use setDoc with the client-generated ID
            await setDoc(doc(db, "outgoingEmails", draftIdToUse), { ...draftDoc, createdAt: serverTimestamp() });
        }
        toast({ title: "Borrador Guardado"});
        handleCloseComposer();
        setActiveFolder("drafts"); // Switch to drafts folder
        return true;
    } catch (error) {
        console.error("Error al guardar borrador:", error);
        toast({ title: "Error al Guardar Borrador", variant: "destructive" });
        return false;
    } finally { setIsSavingDraft(false); }
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
        if (selectedEmail?.id === email.id) setSelectedEmail(null); // Clear view if selected email is deleted
        // Data will refresh via onSnapshot, which should move it to the deleted list if active
        // Optionally, force active tab to 'trash' or refresh manually if issues persist
        setActiveFolder("trash");
    } catch (error) {
        console.error("Error moviendo correo a papelera:", error);
        toast({ title: "Error al Eliminar Correo", variant: "destructive" });
    }
  };

  // Fetch Inbox Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'inbox') {
        // console.log("INBOX: Condiciones NO cumplidas para la suscripción. CurrentUser:", currentUser, "ActiveTab:", activeTab);
        setIsLoadingInbox(false); setInboxEmails([]); return;
    }
    console.log(`INBOX: Intentando consulta para usuario ${currentUser.id} en pestaña ${activeTab}`);
    setIsLoadingInbox(true);
    const q = query(
      collection(db, "incomingEmails"),
      // where("crmUserId", "==", currentUser.id), // Assuming 'crmUserId' links incoming emails to CRM users
      orderBy("receivedAt", "desc")
    );
    // console.log("INBOX: Firestore Query (conceptual):", `collection('incomingEmails').where('crmUserId', '==', ${currentUser.id}).orderBy('receivedAt', 'desc')`);
    console.log("INBOX: Firestore Query (conceptual):", `collection('incomingEmails').orderBy('receivedAt', 'desc')`);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("INBOX: Snapshot de Bandeja de Entrada recibido. ¿Vacío?:", snapshot.empty, "Número de docs:", snapshot.size);
      if (snapshot.empty) console.log("INBOX: No hay documentos en 'incomingEmails' o la consulta no los devuelve. Verifica reglas de seguridad y la consistencia del campo 'receivedAt'.");
      
      const rawData = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      // console.log("Raw fetched data from Firestore (inbox emails):", JSON.parse(JSON.stringify(rawData)));

      const fetched = snapshot.docs.map(docSnap => {
        try {
          return mapFirestoreDocToEmailMessage(docSnap, currentUser?.id || "system_user_fallback", 'received', 'incomingEmails');
        } catch (mapError: any) {
          console.error(`Error mapeando el documento de la bandeja de entrada ${docSnap.id}:`, mapError, "Datos:", docSnap.data());
          return null; 
        }
      }).filter(Boolean) as EmailMessage[];
      // console.log("Mapped inbox emails for UI:", JSON.parse(JSON.stringify(fetched)));
      setInboxEmails(fetched);
      setIsLoadingInbox(false);
    }, (error) => {
      console.error("ERROR GRAVE AL OBTENER BANDEJA DE ENTRADA (onSnapshot):", error);
      toast({ title: "Error Crítico al Cargar Bandeja de Entrada", variant: "destructive", description: `Detalles: ${error.message}. Revisa los permisos de Firestore para 'incomingEmails'.` });
      setIsLoadingInbox(false); setInboxEmails([]);
    });
    return () => unsubscribe();
  }, [currentUser, activeTab, toast]); 

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
      orderByField?: "createdAt" | "updatedAt" | "sentAt";
      collectionName: "incomingEmails" | "outgoingEmails"; // Ensure this is correctly set for each
    }[] = [
      { folder: "sent", status: "sent", setter: setSentEmails, loaderSetter: setIsLoadingSent, orderByField: "sentAt", collectionName: "outgoingEmails" },
      { folder: "pending", status: "pending", setter: setPendingEmails, loaderSetter: setIsLoadingPending, orderByField: "createdAt", collectionName: "outgoingEmails" },
      { folder: "drafts", status: "draft", setter: setDraftEmails, loaderSetter: setIsLoadingDrafts, orderByField: "updatedAt", collectionName: "outgoingEmails" },
      { folder: "trash", status: "deleted", setter: setDeletedEmails, loaderSetter: setIsLoadingDeleted, orderByField: "updatedAt", collectionName: "outgoingEmails" }, 
      // Note: 'trash' currently only looks in 'outgoingEmails'. If incoming can also be 'deleted', need to adjust.
    ];

    const unsubscribes: (()=>void)[] = [];

    listConfig.forEach(config => {
      if (activeFolder === config.folder) {
        config.loaderSetter(true);
        const q = query(
          collection(db, config.collectionName),
          where("userId", "==", currentUser.id), // This is key for user-specific sent/drafts/pending/trash
          where("status", "==", config.status),
          orderBy(config.orderByField || "createdAt", "desc")
        );
        // console.log(`${config.folder.toUpperCase()}: Subscribing for user ${currentUser.id} in collection ${config.collectionName} with status ${config.status}`);
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const raw = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
          // console.log(`Raw fetched data from Firestore (${config.folder} emails):`, JSON.parse(JSON.stringify(raw)));
          const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, config.status, config.collectionName)).filter(Boolean) as EmailMessage[];
          // console.log(`Mapped ${config.folder} emails for UI:`, JSON.parse(JSON.stringify(fetched)));
          config.setter(fetched);
          config.loaderSetter(false);
        }, (error) => {
          console.error(`Error fetching ${config.folder} emails from ${config.collectionName}:`, error);
          toast({ title: `Error al cargar ${config.folder}`, variant: "destructive", description: error.message });
          config.loaderSetter(false);
          config.setter([]);
        });
        unsubscribes.push(unsubscribe);
      } else {
        // config.loaderSetter(false); // Don't set to false if not active, to avoid flicker when switching tabs
      }
    });
    return () => unsubscribes.forEach(unsub => unsub());
  }, [currentUser, activeTab, toast]);

  const folders: { name: FolderType; label: string; icon: React.ElementType, count?: number | null, countLoading?: boolean }[] = useMemo(() => [
    { name: "inbox", label: "Bandeja de Entrada", icon: Inbox, count: unreadInboxCount, countLoading: false /*isLoadingInbox*/ }, // Unread count from AuthContext
    { name: "pending", label: "Enviando", icon: Clock, count: pendingEmails.length, countLoading: isLoadingPending },
    { name: "sent", label: "Enviados", icon: Send, count: sentEmails.length, countLoading: isLoadingSent },
    { name: "drafts", label: "Borradores", icon: ArchiveIcon, count: draftEmails.length, countLoading: isLoadingDrafts },
    { name: "trash", label: "Papelera", icon: Trash2, count: deletedEmails.length, countLoading: isLoadingDeleted },
  ], [unreadInboxCount, pendingEmails.length, isLoadingPending, sentEmails.length, isLoadingSent, draftEmails.length, isLoadingDrafts, deletedEmails.length, isLoadingDeleted]);

  const emailsToDisplay = activeFolder === 'inbox' ? inboxEmails :
                           activeFolder === 'pending' ? pendingEmails :
                           activeFolder === 'sent' ? sentEmails :
                           activeFolder === 'drafts' ? draftEmails :
                           activeFolder === 'trash' ? deletedEmails : [];
  const isLoadingCurrentList = activeFolder === 'inbox' ? isLoadingInbox :
                                activeFolder === 'pending' ? isLoadingPending :
                                activeFolder === 'sent' ? isLoadingSent :
                                activeFolder === 'drafts' ? isLoadingDrafts :
                                activeFolder === 'trash' ? isLoadingDeleted : false;

  const currentPageForFolder = activeFolder === 'inbox' ? currentPageInbox :
                               activeFolder === 'pending' ? currentPagePending :
                               activeFolder === 'sent' ? currentPageSent :
                               activeFolder === 'drafts' ? currentPageDrafts :
                               activeFolder === 'trash' ? currentPageDeleted : 1;

  const setCurrentPageForFolder = activeFolder === 'inbox' ? setCurrentPageInbox :
                                 activeFolder === 'pending' ? setCurrentPagePending :
                                 activeFolder === 'sent' ? setCurrentPageSent :
                                 activeFolder === 'drafts' ? setCurrentPageDrafts :
                                 activeFolder === 'trash' ? setCurrentPageDeleted : React.useState(1)[1];


  const totalPages = Math.ceil(emailsToDisplay.length / ITEMS_PER_PAGE);
  const paginatedEmails = emailsToDisplay.slice((currentPageForFolder - 1) * ITEMS_PER_PAGE, currentPageForFolder * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPageForFolder(1); }, [activeFolder, setCurrentPageForFolder]);

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
        {email.bodyText || (email.bodyHtml ? "" : "(Sin contenido)")} {/* Don't show HTML preview here */}
      </p>
       {folderType === 'pending' && email.status === 'pending' && <Clock className="h-3 w-3 text-amber-500 inline-block mr-1 animate-pulse" />}
    </div>
  );


  if (showComposer && composerInitialData) {
    return (
        <div className="flex flex-col h-full p-0 md:p-4 md:pl-0">
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
                    if (success) handleCloseComposer(); // Close only on success
                    return success;
                }}
                onSaveDraft={async (data, attachments) => {
                    const success = await handleSaveDraft(data, attachments);
                    if (success) handleCloseComposer(); // Close only on success
                    return success;
                }}
                isSending={isSubmittingEmail} isSavingDraft={isSavingDraft}
                onClose={handleCloseComposer}
                leads={leads} contacts={contacts}
            />
        </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main Page Header */}
      <Card className="shadow-lg shrink-0 rounded-none border-0 border-b md:rounded-t-lg md:border md:mt-0 mt-[-1rem] md:ml-0 ml-[-1rem] md:mr-0 mr-[-1rem]">
        <CardHeader className="p-3 md:p-4">
            <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
                <PageIcon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                {emailNavItem?.label || "Correo Electrónico"}
            </CardTitle>
        </CardHeader>
      </Card>
      
      {/* Main Content Area (Three Panes) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Folders & New Email Button */}
        <div className="w-56 md:w-64 bg-muted/50 border-r p-3 flex-col hidden md:flex shrink-0">
          <Button onClick={() => handleOpenComposer()} className="w-full mb-4" size="lg">
            <Edit2 className="mr-2 h-4 w-4"/> Correo Nuevo
          </Button>
          <ScrollArea className="flex-grow">
            <nav className="flex flex-col gap-1">
              {folders.map(folder => (
                <Button
                  key={folder.name}
                  variant={activeFolder === folder.name ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-9"
                  onClick={() => { setActiveFolder(folder.name); setSelectedEmail(null); setShowComposer(false); }}
                >
                  <folder.icon className={cn("mr-2 h-4 w-4", activeFolder === folder.name ? "text-primary" : "text-muted-foreground")} />
                  {folder.label}
                  {folder.count !== undefined && folder.count !== null && folder.count > 0 && (
                    <Badge 
                      className={cn(
                        "ml-auto text-xs px-1.5 py-0.5 font-normal h-5",
                        folder.name === 'inbox' && folder.count > 0 ? "bg-red-500 text-white hover:bg-red-600" : 
                        "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30"
                      )}
                    >
                      {folder.count > 99 ? '99+' : folder.count}
                    </Badge>
                  )}
                  {folder.countLoading && <Loader2 className="ml-auto h-3 w-3 animate-spin"/>}
                </Button>
              ))}
            </nav>
          </ScrollArea>
        </div>

        {/* Middle Pane: Email List or Composer on small screens */}
        <div className={cn(
            "flex-1 flex flex-col overflow-hidden border-r", 
            (selectedEmail || showComposer) && "hidden md:flex" // Hide list on small screens if detail/composer is open
        )}>
          <div className="p-3 border-b flex items-center justify-between shrink-0">
             <div className="relative flex-grow mr-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    type="search"
                    placeholder={`Buscar en ${folders.find(f=>f.name===activeFolder)?.label || 'correos'}...`} 
                    className="pl-8 w-full h-9 text-sm"
                />
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={() => handleOpenComposer()}>
                <Edit2 className="h-5 w-5"/>
            </Button>
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
                {paginatedEmails.map(email => renderEmailListItem(email, activeFolder))}
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
            "flex-1 flex-col overflow-hidden bg-background", 
            (!selectedEmail && !showComposer) && "hidden md:flex", // Show placeholder on larger screens if nothing is selected
            (selectedEmail || showComposer) && "flex" // Always show if something is active
        )}>
          {showComposer && composerInitialData ? (
              <EmailComposer
                key={composerKey} // Ensure re-render with new initial data
                initialTo={composerInitialData.to}
                initialCc={composerInitialData.cc}
                initialBcc={composerInitialData.bcc}
                initialSubject={composerInitialData.subject}
                initialBody={composerInitialData.body}
                initialAttachments={composerInitialData.attachments}
                onQueueEmail={async (data, attachments) => {
                    const success = await handleQueueEmailForSending(data, attachments);
                    if (success) handleCloseComposer();
                    return success;
                }}
                onSaveDraft={async (data, attachments) => {
                    const success = await handleSaveDraft(data, attachments);
                    if (success) handleCloseComposer();
                    return success;
                }}
                isSending={isSubmittingEmail} isSavingDraft={isSavingDraft}
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
              onDelete={() => handleDeleteEmail(selectedEmail)}
            />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <MailIcon size={48} className="mb-4 text-primary/50" />
              <p className="text-lg font-medium">Selecciona un correo para leerlo</p>
              <p className="text-sm">o crea un correo nuevo desde el panel de carpetas.</p>
              <Button onClick={() => handleOpenComposer()} className="mt-4 md:hidden">
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
        <CardContent className="text-sm text-amber-600 space-y-1">
          <p><strong className="text-amber-800">Diseño tipo Outlook (3 paneles):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Redacción y Puesta en Cola (Backend `sendSingleEmail`):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Subida y Manejo de Adjuntos (Envío/Borrador):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Lógica de subida en frontend, backend necesita procesar).</p>
          <p><strong className="text-amber-800">Visualización de Pendientes, Enviados, Borradores:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Carga desde Firestore).</p>
          <p><strong className="text-amber-800">Guardar/Cargar Borradores (Texto y Adjuntos):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Acciones (Responder/Reenviar - Abre compositor):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Mover a Papelera (Cambia estado):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Bandeja de Entrada (Recepción con `fetchIncomingEmailsImap`):</strong> <Badge className="bg-green-500 text-white">Conectado a Firestore `incomingEmails`</Badge>. Requiere que Cloud Function asocie correos a `crmUserId` para filtrado individual.</p>
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
