
"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail as MailIcon, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit, Paperclip, UserPlus, XCircle } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { EmailComposer } from "@/components/email/email-composer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import type { EmailMessage, OutgoingEmail, Lead, Contact, FirestoreTimestamp } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO, format } from "date-fns";
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
        // Firestore Timestamp-like object from some SDK versions or direct data
        return new Date(fieldValue.seconds * 1000 + fieldValue.nanoseconds / 1000000).toISOString();
    }
    if (typeof fieldValue === 'string') {
        const parsedDate = parseISO(fieldValue);
        if (isValid(parsedDate)) {
            return parsedDate.toISOString();
        }
    }
    // Handle JS Date objects (e.g., from simpleParser in Cloud Function)
    if (fieldValue instanceof Date && isValid(fieldValue)) {
        return fieldValue.toISOString();
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

  const mapFirestoreDocToEmailMessage = useCallback((
    docSnap: any,
    currentUserIdParam: string | null,
    defaultStatus: EmailMessage['status'] = 'received',
    sourceCollection: 'incomingEmails' | 'outgoingEmails'
  ): EmailMessage | null => {
    try {
        const data = docSnap.data();
        if (!data) return null; // Document might not exist or data is undefined

        const currentUserId = currentUserIdParam || "system_fallback_user";

        let mailDate: string;
        if (sourceCollection === 'incomingEmails') {
            mailDate = parseFirestoreDateToISO(data.date || data.receivedAt || data.createdAt) || new Date(0).toISOString();
        } else { // outgoingEmails
            mailDate = parseFirestoreDateToISO(data.sentAt || data.createdAt || data.updatedAt) || new Date(0).toISOString();
        }

        let fromField = { email: 'desconocido@sistema.com', name: 'Sistema' };
        if (sourceCollection === 'incomingEmails') {
            if (typeof data.from === 'string') {
                fromField = { email: data.from };
            } else if (data.from && typeof data.from.value === 'object' && data.from.value.length > 0) {
                fromField = { email: data.from.value[0].address || 'desconocido', name: data.from.value[0].name };
            } else if (data.from && typeof data.from.address === 'string') {
                fromField = { email: data.from.address, name: data.from.name };
            }
        } else { // outgoingEmails
            fromField = {
                email: data.fromEmail || currentUser?.email || 'noreply@example.com',
                name: data.fromName || currentUser?.name || "Usuario CRM"
            };
        }
        
        let toRecipients: { name?: string; email: string }[] = [];
        if (typeof data.to === 'string') {
            toRecipients = data.to.split(',').map((e: string) => ({ email: e.trim() }));
        } else if (Array.isArray(data.to)) {
            toRecipients = data.to.map((t: any) => (typeof t === 'string' ? { email: t } : (t && typeof t.email === 'string' ? t : { email: 'desconocido' })));
        } else if (data.to && typeof data.to.value === 'object' && data.to.value.length > 0 && sourceCollection === 'incomingEmails') {
            toRecipients = data.to.value.map((t: any) => ({ email: t.address || 'desconocido', name: t.name }));
        } else {
            toRecipients = [{ email: 'desconocido' }];
        }

        const parseRecipientsArray = (recipients: any): { name?: string; email: string }[] => {
          if (typeof recipients === 'string') {
            return recipients.split(',').map((e: string) => ({ email: e.trim() }));
          } else if (Array.isArray(recipients)) {
            return recipients.map((r: any) => (typeof r === 'string' ? { email: r } : (r && typeof r.email === 'string' ? r : { email: 'desconocido'}))).filter(r => r.email !== 'desconocido');
          }
          return [];
        };

        const ccRecipients = parseRecipientsArray(data.cc);
        const bccRecipients = parseRecipientsArray(data.bcc);
        
        const bodyHtmlContent = typeof data.html === 'string' ? data.html : (typeof data.bodyHtml === 'string' ? data.bodyHtml : "");
        let bodyTextContent = typeof data.text === 'string' ? data.text : "";
        if (!bodyTextContent && bodyHtmlContent) {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = bodyHtmlContent;
            bodyTextContent = tempDiv.textContent || tempDiv.innerText || "";
        }


        return {
            id: docSnap.id,
            subject: typeof data.subject === 'string' ? data.subject : "Sin Asunto",
            from: fromField,
            to: toRecipients,
            cc: ccRecipients,
            bcc: bccRecipients,
            date: mailDate,
            receivedAt: sourceCollection === 'incomingEmails' ? parseFirestoreDateToISO(data.receivedAt || data.date) : undefined,
            bodyHtml: bodyHtmlContent,
            bodyText: bodyTextContent.substring(0, 250) + (bodyTextContent.length > 250 ? "..." : ""),
            status: data.status as EmailMessage['status'] || defaultStatus, 
            userId: typeof data.userId === 'string' ? data.userId : (sourceCollection === 'outgoingEmails' ? currentUserId : "system_inbox"),
            attachments: Array.isArray(data.attachments) ? data.attachments : [],
            isRead: typeof data.isRead === 'boolean' ? data.isRead : (defaultStatus !== 'received'),
            labels: Array.isArray(data.labels) ? data.labels : [],
            collectionSource: sourceCollection,
        };
    } catch (error: any) {
        console.error(`Error mapeando documento ${sourceCollection} ${docSnap.id}:`, error, "Datos:", docSnap.data());
        return null;
    }
  }, [currentUser]);

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
    if (paramsExist && !initialData.composerOpenedByButton) { // Only clean URL if opened by URL, not button
        current.delete('to');
        current.delete('subject');
        current.delete('body');
        current.delete('emailId');
        router.replace(`/email?${current.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
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
    if (!currentUser || !emailId || collectionName !== 'incomingEmails') return;
    try {
      await updateDoc(doc(db, collectionName, emailId), { isRead: true, updatedAt: serverTimestamp() });
      setInboxEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: true } : e));
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
            body: email.bodyHtml || email.bodyText, // Prefer HTML for editing
            attachments: email.attachments,
            draftId: email.id,
            composerOpenedByButton: true,
        });
    } else {
        setSelectedEmail(email);
        setShowComposer(false);
        if (email.status === 'received' && !email.isRead && email.collectionSource === 'incomingEmails') {
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
    const actionParam = searchParams.get("action");

    if (emailIdParam && !showComposer && !selectedEmail) {
      const findEmail = (id: string, list: EmailMessage[]) => list.find(e => e.id === id);
      let emailToView = findEmail(emailIdParam, sentEmails) || findEmail(emailIdParam, pendingEmails) || findEmail(emailIdParam, inboxEmails) || findEmail(emailIdParam, draftEmails) || findEmail(emailIdParam, deletedEmails);
      if (emailToView) {
        handleViewEmail(emailToView);
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
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión para enviar correos.", variant: "destructive"});
        return false;
    }
    setIsSubmittingEmail(true);
    try {
      const emailDocId = editingDraftId || doc(collection(db, "outgoingEmails")).id;
      let finalAttachments: { name: string; url: string; size: number; type: string }[] = [];
      if (editingDraftId) {
        const draftBeingSent = draftEmails.find(d => d.id === editingDraftId);
        finalAttachments = draftBeingSent?.attachments || []; // Start with existing draft attachments
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
      
      toast({ title: "Correo en Cola", description: `Tu correo para ${data.to} se enviará pronto.` });
      return true;
    } catch (error) {
      console.error("Error al poner correo en cola:", error);
      toast({ title: "Error al Enviar", description: "No se pudo poner el correo en cola.", variant: "destructive" });
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
        toast({ title: "Borrador Guardado"});
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

    const sourceCol = collectionSource || (currentStatus === 'received' ? 'incomingEmails' : 'outgoingEmails');
    try {
        const batch = writeBatch(db);
        const emailDocRef = doc(db, sourceCol, emailId);
        batch.update(emailDocRef, { status: "deleted", updatedAt: serverTimestamp() });
        // If deleting from inbox and it had unread status, potentially update unread count (complex, handle in AuthContext or similar)
        await batch.commit();
        toast({ title: "Correo Movido a Papelera" });
        if (selectedEmail?.id === emailId) setSelectedEmail(null);
    } catch (error) {
        console.error("Error moviendo correo a papelera:", error);
        toast({ title: "Error al Eliminar Correo", variant: "destructive" });
    }
  };

  // Fetch Inbox Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'inbox') {
        setIsLoadingInbox(false);
        setInboxEmails([]);
        return;
    }
    setIsLoadingInbox(true);
    console.log("Subscribing to inbox emails for user (currently all from 'incomingEmails'):", currentUser.id);
    const q = query(collection(db, "incomingEmails"), where("status", "not-in", ["deleted"]), orderBy("receivedAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Raw fetched data from Firestore (inbox emails):", snapshot.docs.map(d => d.data()));
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
        console.error("Error fetching inbox emails:", error);
        toast({ title: "Error al cargar Bandeja de Entrada", variant: "destructive", description: error.message });
        setIsLoadingInbox(false);
        setInboxEmails([]);
    });
    return () => unsubscribe();
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);

  // Fetch Sent Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'sent') {
        setIsLoadingSent(false);
        setSentEmails([]);
        return;
    }
    setIsLoadingSent(true);
    const q = query(collection(db, "outgoingEmails"), where("userId", "==", currentUser.id), where("status", "==", "sent"), orderBy("createdAt", "desc"));
    console.log("Subscribing to sent emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Raw fetched data from Firestore (sent emails):", snapshot.docs.map(d => d.data()));
        const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, 'sent', 'outgoingEmails')).filter(Boolean) as EmailMessage[];
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
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);

  // Fetch Pending Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'pending') {
        setIsLoadingPending(false);
        setPendingEmails([]);
        return;
    }
    setIsLoadingPending(true);
    const q = query(collection(db, "outgoingEmails"), where("userId", "==", currentUser.id), where("status", "==", "pending"), orderBy("createdAt", "desc"));
    console.log("Subscribing to pending emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Raw fetched data from Firestore (pending emails):", snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, 'pending', 'outgoingEmails')).filter(Boolean) as EmailMessage[];
      console.log("Mapped pending emails for UI:", fetched);
      setPendingEmails(fetched);
      setIsLoadingPending(false);
    }, (error) => {
      console.error("Error fetching pending emails:", error);
      toast({ title: "Error al cargar correos en cola", variant: "destructive", description: error.message });
      setIsLoadingPending(false);
      setPendingEmails([]);
    });
     return () => unsubscribe();
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);

  // Fetch Draft Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'drafts') {
      setIsLoadingDrafts(false);
      setDraftEmails([]);
      return;
    }
    setIsLoadingDrafts(true);
    const q = query(collection(db, "outgoingEmails"), where("userId", "==", currentUser.id), where("status", "==", "draft"), orderBy("updatedAt", "desc"));
    console.log("Subscribing to draft emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Raw fetched data from Firestore (draft emails):", snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, 'draft', 'outgoingEmails')).filter(Boolean) as EmailMessage[];
      console.log("Mapped draft emails for UI:", fetched);
      setDraftEmails(fetched);
      setIsLoadingDrafts(false);
    }, (error) => {
      console.error("Error fetching draft emails:", error);
      toast({ title: "Error al cargar borradores", variant: "destructive", description: error.message });
      setIsLoadingDrafts(false);
      setDraftEmails([]);
    });
     return () => unsubscribe();
  }, [currentUser, activeTab, toast, mapFirestoreDocToEmailMessage]);

  // Fetch Deleted Emails
  useEffect(() => {
    if (!currentUser || activeTab !== 'trash') {
      setIsLoadingDeleted(false);
      setDeletedEmails([]);
      return;
    }
    setIsLoadingDeleted(true);
    const q = query(collection(db, "outgoingEmails"), where("userId", "==", currentUser.id), where("status", "==", "deleted"), orderBy("updatedAt", "desc"));
    // TODO: Also query incomingEmails if they can be deleted
    console.log("Subscribing to deleted emails for user:", currentUser.id);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("Raw fetched data from Firestore (deleted emails):", snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(docSnap => mapFirestoreDocToEmailMessage(docSnap, currentUser.id, 'deleted', 'outgoingEmails')).filter(Boolean) as EmailMessage[];
      console.log("Mapped deleted emails for UI:", fetched);
      setDeletedEmails(fetched);
      setIsLoadingDeleted(false);
    }, (error) => {
      console.error("Error fetching deleted emails:", error);
      toast({ title: "Error al cargar papelera", variant: "destructive", description: error.message });
      setIsLoadingDeleted(false);
      setDeletedEmails([]);
    });
     return () => unsubscribe();
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
                    {email.attachments && email.attachments.length > 0 && <Paperclip className="h-3 w-3 text-muted-foreground" title={`${email.attachments.length} adjunto(s)`}/>}
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{isValid(parseISO(email.date)) ? format(parseISO(email.date), "P") : "Fecha Inv."}</p>
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

  const tabsConfig = [
    { value: "inbox" as const, label: "Bandeja de Entrada", icon: Inbox, data: inboxEmails, isLoading: isLoadingInbox, page: currentPageInbox, setPage: setCurrentPageInbox, count: inboxEmails.filter(e => !e.isRead).length },
    { value: "pending" as const, label: "Enviando", icon: Clock, data: pendingEmails, isLoading: isLoadingPending, page: currentPagePending, setPage: setCurrentPagePending },
    { value: "sent" as const, label: "Enviados", icon: Send, data: sentEmails, isLoading: isLoadingSent, page: currentPageSent, setPage: setCurrentPageSent },
    { value: "drafts" as const, label: "Borradores", icon: ArchiveIcon, data: draftEmails, isLoading: isLoadingDrafts, page: currentPageDrafts, setPage: setCurrentPageDrafts, count: draftEmails.length },
    { value: "trash" as const, label: "Papelera", icon: Trash2, data: deletedEmails, isLoading: isLoadingDeleted, page: currentPageDeleted, setPage: setCurrentPageDeleted, disabled: false }
  ];

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
            body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${format(parseISO(emailToReply.date), "PPpp", { locale: es })}\nPara: ${emailToReply.to.map(t => t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || (emailToReply.bodyHtml ? '(Contenido HTML omitido en respuesta)' : '')}`
          });
        }}
        onReplyAll={(emailToReply) => {
          const allRecipients = [emailToReply.from, ...emailToReply.to.filter(rec => rec.email !== currentUser?.email), ...(emailToReply.cc || []).filter(rec => rec.email !== currentUser?.email)].map(rec => rec.email);
          const uniqueRecipients = [...new Set(allRecipients)].filter(email => email !== emailToReply.from.email);
          handleOpenComposer({
            to: uniqueRecipients.join(','),
            cc: emailToReply.to.find(t => t.email === emailToReply.from.email) ? undefined : emailToReply.from.email,
            subject: `Re: ${emailToReply.subject}`,
            body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${format(parseISO(emailToReply.date), "PPpp", { locale: es })}\nPara: ${emailToReply.to.map(t => t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || (emailToReply.bodyHtml ? '(Contenido HTML omitido en respuesta)' : '')}`
          });
        }}
        onForward={(emailToForward) => {
           handleOpenComposer({
            subject: `Fwd: ${emailToForward.subject}`,
            body: `\n\n\n----- Mensaje Reenviado -----\nDe: ${emailToForward.from.name || emailToForward.from.email}\nEnviado: ${format(parseISO(emailToForward.date), "PPpp", { locale: es })}\nPara: ${emailToForward.to.map(t => t.email).join(', ')}\nAsunto: ${emailToForward.subject}\n\n${emailToForward.bodyHtml || emailToForward.bodyText}`,
            attachments: emailToForward.attachments
          });
        }}
        onDelete={() => handleDeleteEmail(selectedEmail.id, selectedEmail.status, selectedEmail.collectionSource)}
      />
    );
  }

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
                  {tab.value === "inbox" && (
                     <Button onClick={() => handleOpenComposer({ composerOpenedByButton: true })} size="sm">
                        <Edit className="mr-2 h-4 w-4"/> Redactar Nuevo Correo
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
          <p><strong className="text-amber-800">Redacción y Puesta en Cola (Backend `sendSingleEmail`):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Visualización de Pendientes, Enviados, Borradores:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Borradores aún no guardan adjuntos correctamente).</p>
          <p><strong className="text-amber-800">Guardar/Cargar Borradores (Texto):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Acciones (Responder/Reenviar - Abre compositor):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Adjuntos (Envío, Guardado en Borrador):</strong> <Badge className="bg-green-500 text-white">Parcial</Badge> (Subida implementada; mostrar adjuntos de borradores guardados necesita ajuste).</p>
          <p><strong className="text-amber-800">Bandeja de Entrada (Recepción con `fetchIncomingEmailsImap`):</strong> <Badge className="bg-green-500 text-white">Parcial</Badge> (Lee de `incomingEmails`; asociación a usuario CRM y manejo avanzado de adjuntos/leído pendiente).</p>
          <p><strong className="text-amber-800">Papelera (Eliminación Lógica):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Eliminación permanente pendiente).</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmailPage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-6 h-full"><Skeleton className="h-32 w-full shrink-0" /><Skeleton className="h-10 w-1/2 shrink-0" /><Skeleton className="flex-grow w-full" /></div>}>
      <EmailPageContent />
    </Suspense>
  );
}

