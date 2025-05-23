
"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail as MailIcon, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit } from "lucide-react";
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
    if (fieldValue instanceof Timestamp) {
        return fieldValue.toDate().toISOString();
    }
    if (typeof fieldValue === 'object' && fieldValue.seconds !== undefined && fieldValue.nanoseconds !== undefined) {
        return new Date(fieldValue.seconds * 1000 + fieldValue.nanoseconds / 1000000).toISOString();
    }
    if (typeof fieldValue === 'string') {
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
  const { currentUser } = useAuth();
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
  const [currentPageInbox, setCurrentPageInbox] = useState(1);
  const [currentPageSent, setCurrentPageSent] = useState(1);
  const [currentPagePending, setCurrentPagePending] = useState(1);
  const [currentPageDrafts, setCurrentPageDrafts] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);


  const handleOpenComposer = useCallback((initialData: { to?: string, subject?: string, body?: string, attachments?: any[], draftId?: string | null } = {}) => {
    setSelectedEmail(null); // Close detail view if open
    setComposerInitialTo(initialData.to || "");
    setComposerInitialSubject(decodeURIComponent(initialData.subject || ""));
    setComposerInitialBody(decodeURIComponent(initialData.body || ""));
    setComposerInitialAttachments(initialData.attachments || []);
    setEditingDraftId(initialData.draftId || null);
    setComposerKey(Date.now()); // Force re-render of composer with new initial data
    setShowComposer(true);
    
    // Clean up URL params if they were used to open composer
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    const paramsExist = current.has('to') || current.has('subject') || current.has('body') || current.has('emailId');
    if (paramsExist) {
        current.delete('to');
        current.delete('subject');
        current.delete('body');
        current.delete('emailId'); // Also clear emailId if it was used to open a draft
        router.replace(`/email?${current.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null); // Clear editing draft ID
    // If composer was opened by URL params, clean them up
    const fromUrlParams = searchParams.get("to") || searchParams.get("subject") || searchParams.get("body") || searchParams.get("emailId");
    if (fromUrlParams) {
        const current = new URLSearchParams(Array.from(searchParams.entries()));
        current.delete('to');
        current.delete('subject');
        current.delete('body');
        current.delete('emailId');
        router.replace(`/email?${current.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);
  
  const markEmailAsRead = async (emailId: string, collectionName: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser || !emailId) return;
    // For now, we assume 'incomingEmails' is the primary target for read status
    // 'outgoingEmails' are typically "read" by default by the sender.
    if (collectionName !== 'incomingEmails') return;

    try {
      await updateDoc(doc(db, collectionName, emailId), { isRead: true });
      // Optimistic update of local state for immediate UI feedback
      setInboxEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: true } : e));
    } catch (error) {
      console.error(`Error marking email ${emailId} as read in ${collectionName}:`, error);
      toast({ title: "Error al marcar correo como leído", variant: "destructive" });
    }
  };


  const handleViewEmail = (email: EmailMessage) => {
    if (email.status === 'draft' && currentUser && email.userId === currentUser.id) {
        // Open draft in composer
        handleOpenComposer({
            to: email.to.map(t => t.email).join(','),
            subject: email.subject,
            body: email.bodyHtml || email.bodyText,
            attachments: email.attachments,
            draftId: email.id,
        });
    } else {
        setSelectedEmail(email);
        setShowComposer(false); // Ensure composer is closed when viewing detail
        if (email.status === 'received' && !email.isRead && email.collectionSource === 'incomingEmails') {
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
        } catch (error) {
            console.error("Error fetching leads/contacts for email composer:", error);
            toast({title: "Error al cargar datos de destinatarios", variant: "destructive"});
        }
    };
    fetchLeadsAndContacts();
  }, [toast]);


  // Effect to handle opening composer or email detail from URL params
  useEffect(() => {
    const toParam = searchParams.get("to");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId"); // For opening a specific email (draft or sent)
    const actionParam = searchParams.get("action"); // e.g., 'view'

    if (emailIdParam && !showComposer && !selectedEmail) {
      // Try to find email in any list if not already selected/composer open
      // This part might need to be smarter if emails aren't pre-loaded or need specific fetching
      const findEmail = (id: string, list: EmailMessage[]) => list.find(e => e.id === id);
      let emailToView = findEmail(emailIdParam, sentEmails) ||
                        findEmail(emailIdParam, pendingEmails) ||
                        findEmail(emailIdParam, inboxEmails) ||
                        findEmail(emailIdParam, draftEmails) ||
                        findEmail(emailIdParam, deletedEmails);

      if (emailToView) {
        handleViewEmail(emailToView);
      } else if (actionParam === 'compose_draft') {
        // Potentially fetch draft details if not in list and then open composer
        // For now, this assumes if emailId is present, it's for viewing or editing a loaded draft
      }
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
            uploadTask.on(
                "state_changed",
                null, // We can add a progress handler here if needed in the future
                (error) => {
                    console.error("Error uploading attachment:", error);
                    reject(error);
                },
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
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión para enviar correos.", variant: "destructive"});
        return false;
    }
    setIsSubmittingEmail(true);
    try {
      const emailDocId = editingDraftId || doc(collection(db, "outgoingEmails")).id;
      
      let finalAttachments: { name: string; url: string; size: number; type: string }[] = [];
      if (editingDraftId) {
        const draftBeingSent = draftEmails.find(d => d.id === editingDraftId);
        finalAttachments = draftBeingSent?.attachments || [];
      }
      if (newAttachments.length > 0) {
        const uploadedNewAttachments = await uploadAttachments(newAttachments, currentUser.id, emailDocId);
        finalAttachments = [...finalAttachments, ...uploadedNewAttachments];
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
        attachments: finalAttachments,
        updatedAt: serverTimestamp(),
      };

      if (editingDraftId) {
        await updateDoc(doc(db, "outgoingEmails", editingDraftId), emailDoc);
      } else {
        await setDoc(doc(db, "outgoingEmails", emailDocId), { ...emailDoc, createdAt: serverTimestamp() });
      }
      
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

  const handleSaveDraft = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, newAttachments: File[]) => {
    if (!currentUser) {
        toast({ title: "Error de autenticación", variant: "destructive"});
        return false;
    }
    setIsSavingDraft(true);
    try {
        const draftIdToUse = editingDraftId || doc(collection(db, "outgoingEmails")).id;
        
        let finalAttachments: { name: string; url: string; size: number; type: string }[] = [];
        if (editingDraftId) {
            const currentDraft = draftEmails.find(d => d.id === editingDraftId);
            finalAttachments = currentDraft?.attachments || [];
        }
        if (newAttachments.length > 0) {
            const uploadedNewAttachments = await uploadAttachments(newAttachments, currentUser.id, draftIdToUse);
            finalAttachments = [...finalAttachments, ...uploadedNewAttachments];
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
            attachments: finalAttachments,
            updatedAt: serverTimestamp(),
        };

        if (editingDraftId) {
            await updateDoc(doc(db, "outgoingEmails", editingDraftId), draftDoc);
        } else {
            await setDoc(doc(db, "outgoingEmails", draftIdToUse), { ...draftDoc, createdAt: serverTimestamp() });
        }

        toast({ title: "Borrador Guardado", description: "Tu correo ha sido guardado como borrador." });
        return true;
    } catch (error) {
        console.error("Error al guardar borrador:", error);
        toast({ title: "Error al Guardar Borrador", variant: "destructive" });
        return false;
    } finally {
      setIsSavingDraft(false);
    }
  };
  
  const handleDeleteEmail = async (emailId: string, currentStatus: EmailMessage['status'], collectionSource?: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser || !emailId) return;
    if (!window.confirm("¿Estás seguro de que quieres mover este correo a la papelera?")) return;

    const collectionName = collectionSource || (currentStatus === 'received' ? 'incomingEmails' : 'outgoingEmails');
    try {
        await updateDoc(doc(db, collectionName, emailId), {
            status: "deleted",
            updatedAt: serverTimestamp()
        });
        toast({ title: "Correo Movido a Papelera" });
        if (selectedEmail?.id === emailId) setSelectedEmail(null);
        // Optimistic update or refetch will handle removing from current list
        // and adding to deletedEmails list if activeTab becomes 'trash'.
    } catch (error) {
        console.error("Error moviendo correo a papelera:", error);
        toast({ title: "Error al Eliminar Correo", variant: "destructive" });
    }
  };

  const mapFirestoreDocToEmailMessage = useCallback((docSnap: any, currentUserId: string | null, defaultStatus: EmailMessage['status'] = 'received', sourceCollection: 'incomingEmails' | 'outgoingEmails'): EmailMessage => {
    const data = docSnap.data();
    
    let mailDate = parseFirestoreDateToISO(data.sentAt || data.receivedAt || data.createdAt || data.updatedAt) || new Date(0).toISOString();

    let fromField = { email: 'desconocido@sistema.com', name: 'Sistema' };
    if (sourceCollection === 'incomingEmails') {
        if (data.from && typeof data.from === 'string') {
            fromField = { email: data.from }; // Simple string from simpleParser
        } else if (data.from && typeof data.from.value === 'object' && data.from.value.length > 0) { // From mailparser (more complex)
            fromField = { email: data.from.value[0].address, name: data.from.value[0].name };
        } else if (data.from && typeof data.from.address === 'string') { // Another possible structure
             fromField = { email: data.from.address, name: data.from.name };
        }
    } else { // outgoingEmails
        fromField = { email: data.fromEmail || (currentUserId ? currentUser?.email : 'noreply@example.com') || 'error@example.com', name: data.fromName || (currentUserId ? currentUser?.name : "Usuario CRM") || "Usuario CRM" };
    }
    
    let toRecipients: { name?: string; email: string }[] = [];
    if (typeof data.to === 'string') {
        toRecipients = data.to.split(',').map((e: string) => ({ email: e.trim() }));
    } else if (Array.isArray(data.to)) {
        toRecipients = data.to.map((t: any) => (typeof t === 'string' ? { email: t } : (t && typeof t.email === 'string' ? t : { email: 'desconocido' })));
    } else if (data.to && typeof data.to.value === 'object' && data.to.value.length > 0 && sourceCollection === 'incomingEmails') { // from mailparser for incoming
        toRecipients = data.to.value.map((t: any) => ({ email: t.address, name: t.name }));
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
        receivedAt: parseFirestoreDateToISO(data.receivedAt), // Specific to incoming emails
        bodyHtml: typeof data.html === 'string' ? data.html : (typeof data.bodyHtml === 'string' ? data.bodyHtml : ""),
        bodyText: typeof data.text === 'string' ? data.text : (typeof data.bodyHtml === 'string' ? data.bodyHtml.replace(/<[^>]+>/g, '').substring(0, 150) + "..." : "Sin cuerpo de texto."),
        status: data.status as EmailMessage['status'] || defaultStatus, 
        userId: typeof data.userId === 'string' ? data.userId : (currentUserId || "unknown_user"),
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        isRead: typeof data.isRead === 'boolean' ? data.isRead : (defaultStatus !== 'received'), // Default to read unless it's incoming
        labels: Array.isArray(data.labels) ? data.labels : [],
        collectionSource: sourceCollection,
    };
  }, [currentUser]);


  // Fetch Inbox Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'inbox') {
        setIsLoadingInbox(false);
        setInboxEmails([]);
        return;
    }
    setIsLoadingInbox(true);
    console.log("Subscribing to inbox emails for user:", currentUser.id);
    // Note: The query for 'incomingEmails' might need to be adjusted if it's user-specific
    // For now, it fetches all, assuming a shared inbox or admin view.
    const q = query(
        collection(db, "incomingEmails"),
        where("status", "not-in", ["deleted"]), // Exclude deleted emails
        orderBy("receivedAt", "desc") 
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Raw fetched data from Firestore (inbox emails):", snapshot.docs.map(d => d.data()));
        const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'received', 'incomingEmails'));
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
    console.log("Subscribing to sent emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Raw fetched data from Firestore (sent emails):", snapshot.docs.map(d => d.data()));
        const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'sent', 'outgoingEmails'));
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

  // Fetch Pending Emails
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
      const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'pending', 'outgoingEmails'));
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

  // Fetch Draft Emails
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
      orderBy("updatedAt", "desc")
    );
    console.log("Subscribing to draft emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Raw fetched data from Firestore (draft emails):", snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'draft', 'outgoingEmails'));
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

  // Fetch Deleted Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'trash') {
      setIsLoadingDeleted(false);
      setDeletedEmails([]);
      return;
    }
    setIsLoadingDeleted(true);
    // Note: This queries only outgoingEmails. You might need to query incomingEmails too
    // or have a more sophisticated trash system.
    const q = query(
      collection(db, "outgoingEmails"), // Consider querying 'incomingEmails' as well or having a unified 'trash' field
      where("userId", "==", currentUser.id),
      where("status", "==", "deleted"),
      orderBy("updatedAt", "desc")
    );
    console.log("Subscribing to deleted emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Raw fetched data from Firestore (deleted emails):", snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(doc => mapFirestoreDocToEmailMessage(doc, currentUser.id, 'deleted', 'outgoingEmails'));
      console.log("Mapped deleted emails for UI:", fetched);
      setDeletedEmails(fetched);
      setIsLoadingDeleted(false);
    }, (error) => {
      console.error("Error fetching deleted emails:", error);
      toast({ title: "Error al cargar papelera", variant: "destructive", description: error.message });
      setIsLoadingDeleted(false);
      setDeletedEmails([]);
    });
     return () => {
      console.log("Unsubscribing from deleted emails");
      unsubscribe();
    }
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);


  const renderEmailList = (
    emailList: EmailMessage[],
    statusType: EmailMessage['status'] | 'inbox', // 'inbox' is special for incomingEmails
    isLoadingList: boolean,
    currentPage: number,
    setCurrentPage: (page: number) => void,
    onViewEmail: (email: EmailMessage) => void,
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
          <div key={email.id} className="hover:shadow-md cursor-pointer border rounded-md" onClick={() => onViewEmail(email)}>
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
                    {email.attachments && email.attachments.length > 0 && <Paperclip className="h-3 w-3 text-muted-foreground" title={`${email.attachments.length} adjunto(s)`}/>}
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
                key={composerKey} // Force re-mount with new key for fresh state
                initialTo={composerInitialTo}
                initialSubject={composerInitialSubject}
                initialBody={composerInitialBody}
                initialAttachments={composerInitialAttachments}
                onQueueEmail={async (data, attachments) => {
                    const success = await handleQueueEmailForSending(data, attachments);
                    if (success) {
                        handleCloseComposer();
                        setActiveTab("pending"); // Go to pending tab after queuing
                    }
                    return success;
                }}
                onSaveDraft={async (data, attachments) => {
                    const success = await handleSaveDraft(data, attachments);
                    if (success) {
                        handleCloseComposer();
                        setActiveTab("drafts"); // Go to drafts tab after saving
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
            body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${new Date(emailToReply.date).toLocaleString()}\nPara: ${emailToReply.to.map(t => t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || (emailToReply.bodyHtml ? '(Contenido HTML omitido en respuesta)' : '')}`
          });
        }}
        onReplyAll={(emailToReply) => {
          const allRecipients = [
            emailToReply.from, 
            ...emailToReply.to.filter(rec => rec.email !== currentUser?.email), // Exclude self if user is in 'to'
            ...(emailToReply.cc || []).filter(rec => rec.email !== currentUser?.email) // Exclude self if user is in 'cc'
          ].map(rec => rec.email);
          const uniqueRecipients = [...new Set(allRecipients)].filter(email => email !== emailToReply.from.email); // Ensure original sender is not in To if they are in From

          handleOpenComposer({
            to: uniqueRecipients.join(','), // Original sender becomes primary recipient if not self
            // CC remains same, excluding self and original sender if they were in CC
            // This logic can be complex, for now, we'll just include 'to' and original 'from'
            cc: emailToReply.to.find(t => t.email === emailToReply.from.email) ? undefined : emailToReply.from.email, // If original sender was in TO, then don't CC them.
            subject: `Re: ${emailToReply.subject}`,
            body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${new Date(emailToReply.date).toLocaleString()}\nPara: ${emailToReply.to.map(t => t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || (emailToReply.bodyHtml ? '(Contenido HTML omitido en respuesta)' : '')}`
          });
        }}
        onForward={(emailToForward) => {
           handleOpenComposer({
            subject: `Fwd: ${emailToForward.subject}`,
            body: `\n\n\n----- Mensaje Reenviado -----\nDe: ${emailToForward.from.name || emailToForward.from.email}\nEnviado: ${new Date(emailToForward.date).toLocaleString()}\nPara: ${emailToForward.to.map(t => t.email).join(', ')}\nAsunto: ${emailToForward.subject}\n\n${emailToForward.bodyHtml || emailToForward.bodyText}`,
            attachments: emailToForward.attachments
          });
        }}
        onDelete={() => handleDeleteEmail(selectedEmail.id, selectedEmail.status, selectedEmail.collectionSource)}
      />
    );
  }

  const tabsConfig = [
    { value: "inbox" as const, label: "Bandeja de Entrada", icon: Inbox, data: inboxEmails, isLoading: isLoadingInbox, page: currentPageInbox, setPage: setCurrentPageInbox },
    { value: "pending" as const, label: "Enviando", icon: Clock, data: pendingEmails, isLoading: isLoadingPending, page: currentPagePending, setPage: setCurrentPagePending },
    { value: "sent" as const, label: "Enviados", icon: Send, data: sentEmails, isLoading: isLoadingSent, page: currentPageSent, setPage: setCurrentPageSent },
    { value: "drafts" as const, label: "Borradores", icon: ArchiveIcon, data: draftEmails, isLoading: isLoadingDrafts, page: currentPageDrafts, setPage: setCurrentPageDrafts, count: draftEmails.length },
    { value: "trash" as const, label: "Papelera", icon: Trash2, data: deletedEmails, isLoading: isLoadingDeleted, page: currentPageDeleted, setPage: setCurrentPageDeleted, disabled: false }
  ];

  return (
    <div className="flex flex-col gap-6 h-full">
      <Card className="shadow-lg shrink-0">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div className="flex-grow">
                <CardTitle className="flex items-center gap-2 text-2xl">
                    <PageIcon className="h-6 w-6 text-primary" />
                    {navItem?.label || "Correo Electrónico"}
                </CardTitle>
                <CardDescription>
                    Gestiona tus comunicaciones por correo electrónico directamente desde el CRM.
                </CardDescription>
              </div>
              <Button onClick={() => handleOpenComposer()} size="sm" className="mt-2 sm:mt-0">
                  <Edit className="mr-2 h-4 w-4"/> Redactar Nuevo Correo
              </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as any); setSelectedEmail(null);}} className="flex-grow flex flex-col">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 shrink-0">
          {tabsConfig.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
              <tab.icon className="mr-2 h-4 w-4" />{tab.label}
              {(tab.value === "drafts" || tab.value === "inbox") && tab.count !== undefined && tab.count > 0 && (
                <Badge variant={tab.value === "inbox" ? "destructive" : "secondary"} className="ml-2 text-xs px-1.5 py-0.5">{tab.count}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {tabsConfig.map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="flex-grow mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{tab.label}</CardTitle>
                  {/* No add button here as it's global now */}
              </CardHeader>
              <CardContent>{renderEmailList(tab.data, tab.value, tab.isLoading, tab.page, tab.setPage, handleViewEmail)}</CardContent>
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
            <span className="block text-xs text-amber-700/80">Mejoras pendientes: asociación de correos a usuarios específicos del CRM, sincronización de estado leído/no leído con servidor IMAP.</span>
          </p>
           <p>
            <strong className="text-amber-800">Papelera (Eliminación Lógica):</strong> <span className="font-semibold text-green-600">Implementado (Marcado como 'deleted').</span>
            <span className="block text-xs text-amber-700/80">Pendiente: Opción de eliminación permanente y vaciado de papelera.</span>
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

