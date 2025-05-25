
"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Asegúrate de que Input esté importado
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore'; // Asegúrate de que deleteDoc y writeBatch estén importados si los usas
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import type { EmailMessage, OutgoingEmail, Lead, Contact, User, FolderType } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO, format, formatDistanceToNowStrict, startOfDay, endOfDay } from "date-fns";
import { es } from 'date-fns/locale';
import { EmailComposer } from "@/components/email/email-composer";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/lib/constants";
import { Mail as MailIconLucide, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit2, Paperclip, UserPlus, XCircle, FileText, Search, MessageSquare, Users as UsersIcon, Folder as FolderIcon, AlertCircle } from "lucide-react"; // Usar alias para Mail
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/lib/utils";


const ITEMS_PER_PAGE = 10;

// Mapeo de Firestore doc a EmailMessage
const mapFirestoreDocToEmailMessage = (
  docSnap: any,
  currentUserIdParam: string | null, // Hacerlo opcional si a veces no se tiene
  defaultStatus: EmailMessage['status'],
  sourceCollection: 'incomingEmails' | 'outgoingEmails'
): EmailMessage | null => {
  const data = docSnap.data();
  if (!data) {
    console.warn(`mapFirestoreDocToEmailMessage: No data for document ${docSnap.id} from collection ${sourceCollection}`);
    return null;
  }

  let fromField: { name?: string; email: string } = { email: 'desconocido@sistema.com', name: 'Remitente Desconocido' };
  if (sourceCollection === 'incomingEmails' && data.from_parsed && Array.isArray(data.from_parsed) && data.from_parsed.length > 0) {
    fromField = { email: data.from_parsed[0].address || 'desconocido@sistema.com', name: data.from_parsed[0].name || undefined };
  } else if (typeof data.from === 'string') {
    const fromMatch = data.from.match(/^(.*?)\s*<([^>]+)>$/);
    if (fromMatch) fromField = { name: fromMatch[1].trim() || undefined, email: fromMatch[2].trim() };
    else if (data.from.includes('@')) fromField = { email: data.from.trim() };
  } else if (sourceCollection === 'outgoingEmails' && typeof data.fromEmail === 'string') {
    fromField = { email: data.fromEmail, name: data.fromName || undefined };
  }

  let toRecipients: { name?: string; email: string }[] = [];
  if (sourceCollection === 'incomingEmails' && data.to_parsed && Array.isArray(data.to_parsed)) {
    toRecipients = data.to_parsed
      .map((t: any) => (t && typeof t.address === 'string' ? { email: t.address, name: t.name || undefined } : null))
      .filter(Boolean) as { name?: string; email: string }[];
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
  if (toRecipients.length === 0) toRecipients = [{ email: 'destinatario-desconocido@sistema.com', name: 'Destinatario Desconocido' }];


  const parseAddressStringToArray = (addressString?: string): { name?: string; email: string }[] => {
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
  const ccRecipients = parseAddressStringToArray(data.cc);
  const bccRecipients = parseAddressStringToArray(data.bcc);

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
    if (typeof fieldValue === 'string') {
      const parsedDate = parseISO(fieldValue);
      if (isValid(parsedDate)) return parsedDate.toISOString();
      try {
        const attemptParse = new Date(fieldValue);
        if (isValid(attemptParse)) {
          console.warn(`Date field '${fieldNameForLog}' in doc '${docIdForLog}' was a non-ISO string '${fieldValue}', parsed as local time. Consider storing as Timestamp in Firestore for consistency.`);
          return attemptParse.toISOString();
        } else {
          console.warn(`Invalid date string for '${fieldNameForLog}' in doc '${docIdForLog}':`, fieldValue, ". Expected Firestore Timestamp or ISO 8601 string. Attempting direct use.");
          return fieldValue; // Last resort, might be problematic for date-fns
        }
      } catch (e) {
        console.warn(`Error attempting to parse non-ISO string '${fieldValue}' with new Date() for ${fieldNameForLog} in doc ${docIdForLog}:`, e);
      }
      return undefined;
    }
    console.warn(`Unexpected date format for '${fieldNameForLog}' in doc '${docIdForLog}':`, fieldValue, typeof fieldValue);
    return undefined;
  };

  let mailDate: string = new Date(0).toISOString();
  let receivedAtDate: string | undefined;

  if (sourceCollection === 'incomingEmails') {
    mailDate = parseFirestoreDateToISO(data.date, `date (incoming) for doc ${docSnap.id}`, docSnap.id) || mailDate;
    receivedAtDate = parseFirestoreDateToISO(data.receivedAt, `receivedAt (incoming) for doc ${docSnap.id}`, docSnap.id);
  } else {
    const sentAtParsed = parseFirestoreDateToISO(data.sentAt, `sentAt (outgoing) for doc ${docSnap.id}`, docSnap.id);
    const createdAtParsed = parseFirestoreDateToISO(data.createdAt, `createdAt (outgoing) for doc ${docSnap.id}`, docSnap.id);
    const updatedAtParsed = parseFirestoreDateToISO(data.updatedAt, `updatedAt (outgoing) for doc ${docSnap.id}`, docSnap.id);
    mailDate = sentAtParsed || updatedAtParsed || createdAtParsed || mailDate;
  }

  let emailIsRead = false;
  if (sourceCollection === 'incomingEmails') {
    emailIsRead = typeof data.isRead === 'boolean' ? data.isRead : false;
  } else {
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
    bodyText: typeof data.text === 'string' ? data.text : (typeof data.bodyHtml === 'string' && data.bodyHtml.length > 0 && data.bodyHtml.length > 150 ? data.bodyHtml.substring(0, 150) + "..." : (typeof data.bodyHtml === 'string' ? data.bodyHtml : "(Sin contenido de texto)")),
    status: data.status as EmailMessage['status'] || defaultStatus,
    isRead: emailIsRead,
    attachments: Array.isArray(data.attachments) ? data.attachments.map((att: any) => ({ name: att.name || "adjunto", url: att.url || "#", size: att.size, type: att.type })) : [],
    collectionSource: sourceCollection,
    threadId: data.threadId || undefined,
    relatedLeadId: data.relatedLeadId || undefined,
    relatedContactId: data.relatedContactId || undefined,
    relatedTicketId: data.relatedTicketId || undefined,
    userId: data.userId || (currentUserIdParam || "unknown_user"),
    crmUserId: sourceCollection === 'incomingEmails' ? (data.crmUserId || data.userId || undefined) : undefined,
  };
};


interface EmailFolderViewProps {
  currentUser: User | null;
  currentEmailFolderTab: FolderType;
  toast: ReturnType<typeof useToast>['toast'];
  onViewEmail: (email: EmailMessage) => void;
  selectedEmailId: string | null;
}

function EmailFolderView({
  currentUser,
  currentEmailFolderTab,
  toast,
  onViewEmail,
  selectedEmailId,
}: EmailFolderViewProps) {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTermLocal, setSearchTermLocal] = useState("");

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (!currentUser) {
      setIsLoading(false);
      setEmails([]);
      return;
    }

    console.log(`EmailFolderView: useEffect triggered. Tab: ${currentEmailFolderTab}, User: ${currentUser.id}`);
    setIsLoading(true);
    setEmails([]); // Clear previous emails
    setCurrentPage(1); // Reset to first page

    let q: any;
    let sourceCollection: 'incomingEmails' | 'outgoingEmails';
    let statusFilter: EmailMessage['status'] | EmailMessage['status'][];

    switch (currentEmailFolderTab) {
      case 'inbox':
        sourceCollection = 'incomingEmails';
        console.log(`INBOX (EmailFolderView): Attempting query for user ${currentUser.id} on tab ${currentEmailFolderTab}`);
        q = query(
          collection(db, sourceCollection),
          where("userId", "==", currentUser.id), // Assuming incomingEmails now has userId of the CRM user it belongs to
          orderBy("receivedAt", "desc")
        );
        break;
      case 'sent':
        sourceCollection = 'outgoingEmails';
        statusFilter = 'sent';
        q = query(
          collection(db, sourceCollection),
          where("userId", "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy("createdAt", "desc")
        );
        break;
      case 'pending':
        sourceCollection = 'outgoingEmails';
        statusFilter = 'pending';
        q = query(
          collection(db, sourceCollection),
          where("userId", "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy("createdAt", "desc")
        );
        break;
      case 'drafts':
        sourceCollection = 'outgoingEmails';
        statusFilter = 'draft';
        q = query(
          collection(db, sourceCollection),
          where("userId", "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy("updatedAt", "desc")
        );
        break;
      case 'trash':
        sourceCollection = 'outgoingEmails'; // For now, only outgoing. Could query both if incoming can be 'deleted'
        statusFilter = 'deleted';
        q = query(
          collection(db, sourceCollection),
          where("userId", "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy("updatedAt", "desc")
        );
        break;
      default:
        setIsLoading(false);
        return;
    }

    unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`${currentEmailFolderTab.toUpperCase()} (EmailFolderView): Snapshot received. Empty?: ${snapshot.empty}, Size: ${snapshot.size}`);
      // console.log(`Raw fetched data from Firestore (${currentEmailFolderTab} emails):`, snapshot.docs.map(d => d.data()));
      const fetched = snapshot.docs.map(docSnap => {
        try {
          return mapFirestoreDocToEmailMessage(docSnap, currentUser?.id || "system_user_fallback", Array.isArray(statusFilter) ? statusFilter[0] : statusFilter || 'received', sourceCollection);
        } catch (mapError: any) {
          console.error(`Error mapping ${currentEmailFolderTab} document ${docSnap.id}:`, mapError, "Data:", docSnap.data());
          return null;
        }
      }).filter(Boolean) as EmailMessage[];
      // console.log(`Mapped ${currentEmailFolderTab} emails for UI:`, fetched);
      setEmails(fetched);
      setIsLoading(false);
    }, (error) => {
      console.error(`ERROR FETCHING ${currentEmailFolderTab.toUpperCase()} EMAILS (onSnapshot):`, error);
      toast({ title: `Error Crítico al Cargar ${currentEmailFolderTab}`, variant: "destructive", description: `Detalles: ${error.message}.` });
      setIsLoading(false);
      setEmails([]);
    });

    return () => {
      if (unsubscribe) {
        console.log(`Unsubscribing from ${currentEmailFolderTab} listener.`);
        unsubscribe();
      }
    };
  }, [currentUser, currentEmailFolderTab, toast]);


  const filteredEmails = emails.filter(email =>
    email.subject.toLowerCase().includes(searchTermLocal.toLowerCase()) ||
    (email.from.name && email.from.name.toLowerCase().includes(searchTermLocal.toLowerCase())) ||
    email.from.email.toLowerCase().includes(searchTermLocal.toLowerCase()) ||
    (email.to.some(recipient => recipient.name && recipient.name.toLowerCase().includes(searchTermLocal.toLowerCase()))) ||
    (email.to.some(recipient => recipient.email.toLowerCase().includes(searchTermLocal.toLowerCase())))
  );

  const totalPages = Math.ceil(filteredEmails.length / ITEMS_PER_PAGE);
  const paginatedEmails = filteredEmails.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const renderEmailListItem = (email: EmailMessage) => {
    const isUnread = email.status === 'received' && !email.isRead;
    return (
      <div
        key={email.id}
        className={cn(
          "w-full text-left p-2.5 hover:bg-accent/80 focus-visible:bg-accent/80 outline-none border-b cursor-pointer flex items-start gap-3",
          selectedEmailId === email.id && "bg-primary/15 hover:bg-primary/20",
          isUnread && "bg-primary/5 hover:bg-primary/10 border-l-2 border-primary font-semibold"
        )}
        onClick={() => onViewEmail(email)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onViewEmail(email)}
      >
        <Avatar className="h-8 w-8 mt-0.5">
           <AvatarImage src={`https://avatar.vercel.sh/${email.from.email}.png`} alt={email.from.name || email.from.email} data-ai-hint="sender avatar" />
          <AvatarFallback>{getUserInitials(email.from.name || email.from.email)}</AvatarFallback>
        </Avatar>
        <div className="flex-grow min-w-0">
            <div className="flex justify-between items-baseline">
                <p className={cn("truncate max-w-[150px] md:max-w-[200px] text-sm", isUnread ? "text-primary font-bold" : "text-foreground font-medium")}>
                {currentEmailFolderTab === 'inbox' || email.collectionSource === 'incomingEmails'
                    ? (email.from.name || email.from.email)
                    : (Array.isArray(email.to) && email.to.length > 0 ? `Para: ${email.to.map(t => t.name || t.email).join(', ')}` : "Para: Desconocido")
                }
                </p>
                <time className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap ml-2">
                {isValid(parseISO(email.date)) ? formatDistanceToNowStrict(parseISO(email.date), { addSuffix: true, locale: es }) : "Fecha Inv."}
                </time>
            </div>
            <p className={cn("text-sm truncate mt-0.5", isUnread ? "text-primary" : "")}>
                {email.subject || "(Sin Asunto)"}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5 h-4">
                {email.bodyText || (typeof email.bodyHtml === 'string' && email.bodyHtml.trim() !== "" ? "" : "(Sin contenido)")}
            </p>
        </div>
        {(currentEmailFolderTab === 'pending' && email.status === 'pending') && <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse ml-auto self-center shrink-0" />}
      </div>
    );
  };

  const folderConfig = useMemo(() => foldersConfig.find(f => f.name === currentEmailFolderTab), [currentEmailFolderTab]);

  if (isLoading) {
    return (
      <>
        <div className="p-3 border-b">
          <Input placeholder={`Buscar en ${folderConfig?.label || 'correos'}...`} className="h-9 text-sm" disabled />
        </div>
        <div className="flex-grow flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </>
    );
  }
  
  return (
    <>
      <div className="p-3 border-b shrink-0">
        <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder={`Buscar en ${folderConfig?.label || 'correos'}...`} 
                className="h-9 text-sm pl-8" 
                value={searchTermLocal}
                onChange={(e) => setSearchTermLocal(e.target.value)}
            />
        </div>
      </div>
      {paginatedEmails.length === 0 ? (
        <div className="flex-grow flex items-center justify-center text-muted-foreground p-4 text-center">
            <p className="text-sm">
                {searchTermLocal ? "No se encontraron correos con ese criterio." : `No hay correos en "${folderConfig?.label}".`}
            </p>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-grow">
            <div className="divide-y">
              {paginatedEmails.map(email => renderEmailListItem(email))}
            </div>
          </ScrollArea>
          {totalPages > 1 && (
            <div className="p-2 border-t flex justify-center shrink-0">
              <Pagination>
                <PaginationContent>
                  <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }} disabled={currentPage === 1} /></PaginationItem>
                  {[...Array(Math.min(3, totalPages))].map((_, i) => {
                      let pageNum = currentPage <= 2 ? i + 1 : (currentPage >= totalPages - 1 ? totalPages - 2 + i : currentPage - 1 + i);
                      if (pageNum < 1 || pageNum > totalPages) return null;
                      return <PaginationItem key={pageNum}><PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(pageNum); }} isActive={currentPage === pageNum}>{pageNum}</PaginationLink></PaginationItem>;
                  })}
                  {totalPages > 3 && currentPage < totalPages - 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                  <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }} disabled={currentPage === totalPages} /></PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </>
  );
}

interface FolderConfig {
  name: FolderType;
  label: string;
  icon: React.ElementType;
  count?: number | null;
  isLoading?: boolean;
  data?: EmailMessage[];
  query?: any; // Placeholder for specific query if needed
}

const foldersConfig: Omit<FolderConfig, 'data' | 'count' | 'isLoading' | 'query'>[] = [
    { name: "inbox",    label: "Bandeja de Entrada", icon: Inbox },
    { name: "pending",  label: "Enviando",           icon: Clock },
    { name: "sent",     label: "Enviados",           icon: Send },
    { name: "drafts",   label: "Borradores",         icon: ArchiveIcon },
    { name: "trash",    label: "Papelera",           icon: Trash2 },
];

function EmailPageContent() {
  const emailNavItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = emailNavItem?.icon || MailIconLucide;
  const { toast } = useToast();
  const { currentUser, unreadInboxCount, isLoadingUnreadCount } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentEmailFolderTab, setCurrentEmailFolderTab] = useState<FolderType>("inbox");
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
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSavingDraftState, setIsSavingDraftState] = useState(false);


  const handleOpenComposer = useCallback((initialData: Partial<typeof composerInitialData> = {}, draftIdToEdit: string | null = null) => {
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

    // Clean URL params if composer opened by button or for a new email
    if (draftIdToEdit === null) {
        const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
        if (currentUrlParams.has('to') || currentUrlParams.has('subject') || currentUrlParams.has('body') || currentUrlParams.has('emailId')) {
            currentUrlParams.delete('to'); currentUrlParams.delete('cc'); currentUrlParams.delete('bcc');
            currentUrlParams.delete('subject'); currentUrlParams.delete('body'); currentUrlParams.delete('emailId');
            router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
        }
    }
  }, [searchParams, router, pathname]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
    setComposerInitialData(null);
    // Clean URL params only if composer was not opened due to URL params
    if (composerInitialData?.draftId || (!searchParams.has('to') && !searchParams.has('subject') && !searchParams.has('body'))) {
        const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
        if (currentUrlParams.has('emailId')) { // Only remove emailId if we were editing a draft
            currentUrlParams.delete('emailId');
            router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
        }
    }
  }, [composerInitialData, searchParams, router, pathname]);

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
      toast({ title: "Error de autenticación", variant: "destructive" });
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
      fromName: composerInitialData?.draftId ? composerInitialData.to : (currentUser.name || "Usuario CRM"), // Use draft 'to' if it's a draft being sent
      fromEmail: composerInitialData?.draftId ? composerInitialData.to : currentUser.email, // Use draft 'to' if it's a draft being sent
      attachments: finalAttachments.length > 0 ? finalAttachments : [],
      updatedAt: serverTimestamp(),
    };

    try {
      if (isSendingDraft) {
        const draftBeingSentDocRef = doc(db, "outgoingEmails", editingDraftId!);
        const draftBeingSentSnap = await getDoc(draftBeingSentDocRef);
        const draftCreatedAt = draftBeingSentSnap.exists() ? draftBeingSentSnap.data().createdAt : serverTimestamp();
        await updateDoc(draftBeingSentDocRef, { ...emailDoc, createdAt: draftCreatedAt });
      } else {
        await setDoc(doc(db, "outgoingEmails", emailIdToUse), { ...emailDoc, createdAt: serverTimestamp() });
      }
      toast({ title: "Correo en Cola", description: `Tu correo para ${data.to} se enviará pronto.` });
      setEditingDraftId(null);
      return true;
    } catch (error) {
      console.error("Error al poner correo en cola:", error);
      toast({ title: "Error al Enviar", variant: "destructive", description: String(error) });
      return false;
    } finally { setIsSubmittingEmail(false); }
  };

  const handleEmailQueued = () => {
    handleCloseComposer();
    setCurrentEmailFolderTab("pending");
  };

  const handleSaveDraft = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, newAttachments: File[]) => {
    if (!currentUser) {
      toast({ title: "Error de autenticación", variant: "destructive" });
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
        const draftBeingSavedDocRef = doc(db, "outgoingEmails", editingDraftId!);
        const draftBeingSavedSnap = await getDoc(draftBeingSavedDocRef);
        const draftCreatedAt = draftBeingSavedSnap.exists() ? draftBeingSavedSnap.data().createdAt : serverTimestamp();
        await updateDoc(draftBeingSavedDocRef, { ...draftDoc, createdAt: draftCreatedAt });
      } else {
        await setDoc(doc(db, "outgoingEmails", draftIdToUse), { ...draftDoc, createdAt: serverTimestamp() });
      }
      toast({ title: "Borrador Guardado" });
      handleCloseComposer();
      setCurrentEmailFolderTab("drafts");
      return true;
    } catch (error) {
      console.error("Error al guardar borrador:", error);
      toast({ title: "Error al Guardar Borrador", variant: "destructive", description: String(error) });
      return false;
    } finally { setIsSavingDraftState(false); }
  };

  const handleDeleteEmail = async (email: EmailMessage) => {
    if (!currentUser || !email.id) return;
    const confirmDelete = window.confirm(`¿Estás seguro de que quieres mover este correo (${email.subject || "Sin Asunto"}) a la papelera?`);
    if (!confirmDelete) return;

    const collectionName = email.collectionSource;
    if (!collectionName) {
      toast({ title: "Error", description: "No se pudo determinar el origen del correo.", variant: "destructive" });
      return;
    }

    try {
      await updateDoc(doc(db, collectionName, email.id), { status: "deleted", updatedAt: serverTimestamp() });
      toast({ title: "Correo Movido a Papelera" });
      if (selectedEmail?.id === email.id) setSelectedEmail(null);
      setCurrentEmailFolderTab("trash");
    } catch (error) {
      console.error("Error moviendo correo a papelera:", error);
      toast({ title: "Error al Eliminar Correo", variant: "destructive", description: String(error) });
    }
  };
  
  const markEmailAsRead = async (emailId: string, collectionName: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser || !emailId || collectionName !== 'incomingEmails') return; // Only mark as read for incoming
    try {
      await updateDoc(doc(db, collectionName, emailId), { isRead: true, updatedAt: serverTimestamp() });
      // Local state update will happen via onSnapshot for inbox
    } catch (error) {
      console.error(`Error al marcar correo ${emailId} como leído en ${collectionName}:`, error);
      toast({ title: "Error al marcar correo como leído", variant: "destructive" });
    }
  };

  const handleViewEmail = (email: EmailMessage) => {
    if (email.status === 'draft' && currentUser && email.userId === currentUser.id) {
      handleOpenComposer({
        to: Array.isArray(email.to) ? email.to.map(t => t.email).join(',') : (typeof email.to === 'string' ? email.to : (email.to as any)?.email),
        cc: Array.isArray(email.cc) ? email.cc.map(c => c.email).join(',') : '',
        bcc: Array.isArray(email.bcc) ? email.bcc.map(b => b.email).join(',') : '',
        subject: email.subject,
        body: email.bodyHtml || email.bodyText,
        attachments: email.attachments,
      }, email.id);
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
        setLeads(leadsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
        setContacts(contactsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Contact)));
      } catch (error) { console.error("Error fetching leads/contacts for email composer:", error); }
    };
    fetchLeadsAndContacts();
  }, []);

  useEffect(() => {
    const toParam = searchParams.get("to");
    const subjectParam = searchParams.get("subject");
    const bodyParam = searchParams.get("body");
    const emailIdParam = searchParams.get("emailId"); // For opening drafts

    if (emailIdParam) {
        // Logic to fetch and open the draft
        const fetchAndOpenDraft = async () => {
            // Placeholder: Fetch draft from Firestore by emailIdParam
            // This needs actual implementation
            // For now, let's assume composerInitialData is set elsewhere if a draft is loaded
        };
        // fetchAndOpenDraft(); // Call it
    } else if ((toParam || subjectParam || bodyParam) && !composerInitialData?.draftId && !selectedEmail && !showComposer) {
      handleOpenComposer({ to: toParam || "", subject: subjectParam || "", body: bodyParam || "" });
    }
  }, [searchParams, handleOpenComposer, showComposer, selectedEmail, composerInitialData]);
  
  const folderDisplayConfigs = useMemo(() => {
    return foldersConfig.map(folder => {
      let count = 0;
      let isLoading = true;

      if (folder.name === 'inbox') {
        count = isLoadingUnreadCount ? 0 : (unreadInboxCount || 0);
        // isLoading for inbox is handled by EmailFolderView internally for its data
      } else if (folder.name === 'drafts') {
        // Placeholder for actual draft count when drafts are fetched
        // For now, using a different approach, count will be derived from fetched draftEmails
      }
      return { ...folder, count, isLoading };
    });
  }, [unreadInboxCount, isLoadingUnreadCount /* add other dependencies if counts are fetched here */]);


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
        <div className={cn("w-56 md:w-64 bg-muted/50 border-r p-3 flex-col shrink-0 flex", (showComposer || selectedEmail) && "hidden md:hidden lg:flex")}>
          <Button onClick={() => handleOpenComposer({}, null)} className="w-full mb-4" size="lg">
            <Edit2 className="mr-2 h-4 w-4" /> Correo Nuevo
          </Button>
          <ScrollArea className="flex-grow">
            <nav className="flex flex-col gap-1">
              {folderDisplayConfigs.map(folder => (
                <Button
                  key={folder.name}
                  variant={currentEmailFolderTab === folder.name ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm h-9"
                  onClick={() => { setCurrentEmailFolderTab(folder.name); setSelectedEmail(null); setShowComposer(false); }}
                  disabled={folder.name === 'trash' && false} // Papelera está habilitada
                >
                  <folder.icon className={cn("mr-2 h-4 w-4", currentEmailFolderTab === folder.name ? "text-primary" : "text-muted-foreground")} />
                  {folder.label}
                  {(folder.name === 'inbox' && folder.count !== undefined && folder.count !== null && folder.count > 0) && (
                    <Badge className="ml-auto text-xs px-1.5 py-0.5 font-normal h-5 bg-red-500 text-white hover:bg-red-600">
                      {folder.count > 99 ? '99+' : folder.count}
                    </Badge>
                  )}
                  {(folder.name === 'drafts' /* && draftEmails.length > 0 */) && ( /* Placeholder for draft count */
                     <Badge className="ml-auto text-xs px-1.5 py-0.5 font-normal h-5 bg-muted-foreground/30 text-black hover:bg-muted-foreground/40">
                      {/* {draftEmails.length > 99 ? '99+' : draftEmails.length} */} 0
                    </Badge>
                  )}
                </Button>
              ))}
            </nav>
          </ScrollArea>
        </div>
        <Separator orientation="vertical" className="h-full hidden md:block" />

        {/* Middle Pane: Email List (now handled by EmailFolderView) */}
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden",
          (showComposer || selectedEmail) && "hidden md:flex flex-[1.5] xl:flex-[2]",
          "md:border-r"
        )}>
          <EmailFolderView
            currentUser={currentUser}
            currentEmailFolderTab={currentEmailFolderTab}
            toast={toast}
            onViewEmail={handleViewEmail}
            selectedEmailId={selectedEmail?.id || null}
          />
        </div>
        <Separator orientation="vertical" className="h-full hidden md:block" />

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
              onReply={(emailToReply) => handleOpenComposer({ 
                  to: emailToReply.from.email, 
                  subject: `Re: ${emailToReply.subject}`, 
                  body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${isValid(parseISO(emailToReply.date)) ? format(parseISO(emailToReply.date), 'PPpp', { locale: es }) : 'Fecha inválida'}\nPara: ${emailToReply.to.map(t => t.name || t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || ""}` 
                }, null)}
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
                  body: `\n\n\n----- Mensaje Original -----\nDe: ${emailToReply.from.name || emailToReply.from.email}\nEnviado: ${isValid(parseISO(emailToReply.date)) ? format(parseISO(emailToReply.date), 'PPpp', { locale: es }) : 'Fecha inválida'}\nPara: ${emailToReply.to.map(t => t.name || t.email).join(', ')}\nAsunto: ${emailToReply.subject}\n\n${emailToReply.bodyText || ""}`
                }, null);
              }}
              onForward={(emailToForward) => handleOpenComposer({ 
                  subject: `Fwd: ${emailToForward.subject}`, 
                  body: `\n\n\n----- Mensaje Reenviado -----\nDe: ${emailToForward.from.name || emailToForward.from.email}\nEnviado: ${isValid(parseISO(emailToForward.date)) ? format(parseISO(emailToForward.date), 'PPpp', { locale: es }) : 'Fecha inválida'}\nPara: ${emailToForward.to.map(t => t.name || t.email).join(', ')}\nAsunto: ${emailToForward.subject}\n\n${emailToForward.bodyHtml || emailToForward.bodyText || ""}`, 
                  attachments: emailToForward.attachments 
                }, null)}
              onDelete={() => handleDeleteEmail(selectedEmail)}
            />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <MailIconLucide size={48} className="mb-4 text-primary/50" />
              <p className="text-lg font-medium">Selecciona un correo para leerlo</p>
              <p className="text-sm">o crea un correo nuevo desde el panel de carpetas.</p>
            </div>
          )}
        </div>
      </div>

      <Card className="mt-4 bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center text-amber-700 text-lg gap-2">
            <Info className="h-5 w-5" />
            Estado de Desarrollo del Módulo de Correo
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600 space-y-2">
          <p><strong className="text-amber-800">UI Tipo Outlook (3 Paneles):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Redacción y Puesta en Cola (Backend `sendSingleEmail`):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Visualización de Pendientes, Enviados:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge></p>
          <p><strong className="text-amber-800">Guardar/Cargar Borradores (Texto y Adjuntos):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Adjuntar Archivos (Subida a Storage y Enlace en Firestore):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización IMAP):</strong> <Badge className="bg-green-500 text-white">Implementado (Backend IMAP vía Cloud Function, filtrado UI por userId)</Badge>. Requiere que la CF IMAP guarde `userId` en `incomingEmails`.</p>
          <p><strong className="text-amber-800">Marcar como Leído/No Leído (Bandeja de Entrada):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Papelera y Eliminación Lógica:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Búsqueda en Lista de Correos (Panel Central):</strong> <Badge className="bg-yellow-500 text-black">Implementado (Básico)</Badge> (Filtra en cliente, puede mejorar con búsqueda en servidor).</p>
          <p><strong className="text-amber-800">Plantillas de Correo para Respuestas Rápidas:</strong> <Badge className="bg-yellow-500 text-black">Pendiente</Badge>.</p>
          <p><strong className="text-amber-800">Sincronización Completa con Múltiples Cuentas Personales (Configuración de Usuario):</strong> <Badge className="bg-green-500 text-white">Parcial</Badge> (UI de configuración personal lista, backend para usar credenciales individuales en envío/recepción pendiente).</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmailPage() {
  return (
    // Suspense es necesario porque EmailPageContent usa useSearchParams
    <React.Suspense fallback={
      <div className="flex flex-col gap-6 h-full">
        <Skeleton className="h-16 w-full shrink-0" />
        <div className="flex flex-1 overflow-hidden">
          <Skeleton className="w-56 md:w-64 border-r shrink-0 hidden md:flex" />
          <Skeleton className="flex-1 border-r" />
          <Skeleton className="flex-1 flex-[2] xl:flex-[3]" />
        </div>
      </div>
    }>
      <EmailPageContent />
    </React.Suspense>
  );
}
```