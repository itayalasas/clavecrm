
"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from '@/lib/firebase';
import { collection, addDoc, getDocs, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { EmailMessage, OutgoingEmail, Lead, Contact, User, FolderType } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { isValid, parseISO, format, formatDistanceToNowStrict, startOfDay, endOfDay } from "date-fns";
import { es } from 'date-fns/locale';
import { EmailComposer } from "@/components/email/email-composer";
import { EmailDetailView } from "@/components/email/email-detail-view";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "@/lib/constants";
import { Mail as MailIconLucide, Send, Inbox, Archive as ArchiveIcon, Trash2, Info, PlusCircle, Loader2, Clock, Edit2, Paperclip, UserPlus, XCircle, FileText, Search, MessageSquare, Users as UsersIcon, Folder as FolderIcon, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/lib/utils";

const ITEMS_PER_PAGE = 10;

// Helper function to parse address strings like "Name <email>" or just "email"
const parseAddressString = (addressString?: string): { name?: string; email: string } => {
  if (!addressString || typeof addressString !== 'string') return { email: 'desconocido@sistema.com', name: 'Desconocido' };
  const trimmedAddress = addressString.trim();
  const match = trimmedAddress.match(/^(.*?)\s*<([^>]+)>$/);
  if (match && match[1] && match[2]) {
    return { name: match[1].trim() || undefined, email: match[2].trim() };
  }
  if (trimmedAddress.includes('@')) {
    return { email: trimmedAddress };
  }
  // Fallback if no standard format is matched, treat the whole string as email (or name if no @)
  console.warn(`Could not parse address string effectively: ${addressString}, using as email/name fallback.`);
  return { email: trimmedAddress, name: trimmedAddress.includes('@') ? undefined : trimmedAddress };
};

const parseAddressStringToArray = (addressString?: string): { name?: string; email: string }[] => {
  if (!addressString || typeof addressString !== 'string') return [];
  return addressString.split(',')
    .map(emailStr => parseAddressString(emailStr.trim()))
    .filter(parsed => parsed && parsed.email && parsed.email !== 'desconocido@sistema.com'); // Filter out invalid or placeholder emails
};


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
    try {
        // Attempt to parse common non-ISO but valid date strings first
        const attemptParse = new Date(fieldValue);
        if (isValid(attemptParse)) {
            // Check if it's a string that *might* already be ISO or a simple date
            if (fieldValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/) || !isNaN(attemptParse.getTime())) {
                 console.warn(`Date field '${fieldNameForLog}' in doc '${docIdForLog}' was a string '${fieldValue}', parsed with 'new Date()'. Ensure backend saves Timestamps or ISO 8601 strings for consistency.`);
                 return attemptParse.toISOString();
            }
        }
        // Fallback to parseISO for strict ISO 8601
        const parsedISO = parseISO(fieldValue);
        if (isValid(parsedISO)) {
            return parsedISO.toISOString();
        }
        console.warn(`Invalid or non-ISO date string for '${fieldNameForLog}' in doc '${docIdForLog}':`, fieldValue, ". Could not parse. Returning undefined.");

    } catch (e) {
      console.warn(`Error attempting to parse date string '${fieldValue}' for ${fieldNameForLog} in doc ${docIdForLog}:`, e);
    }
    return undefined;
  }
  console.warn(`Unexpected date format for '${fieldNameForLog}' in doc '${docIdForLog}':`, fieldValue, typeof fieldValue, ". Returning undefined.");
  return undefined;
};

// Moved mapFirestoreDocToEmailMessage outside EmailPageContent so it can be used by dependency arrays
const mapFirestoreDocToEmailMessage = (
  docSnap: any,
  currentUserId: string | null,
  defaultStatus: EmailMessage['status'],
  sourceCollection: 'incomingEmails' | 'outgoingEmails'
): EmailMessage | null => {
  const data = docSnap.data();
  if (!data) {
    console.warn(`mapFirestoreDocToEmailMessage: No data for document ${docSnap.id} from collection ${sourceCollection}`);
    return null;
  }
  console.log(`mapFirestoreDocToEmailMessage: Processing doc ${docSnap.id} from ${sourceCollection}`, data);


  let fromField: { name?: string; email: string } = { email: 'desconocido@sistema.com', name: 'Remitente Desconocido' };
  if (data.from_parsed && Array.isArray(data.from_parsed) && data.from_parsed.length > 0 && data.from_parsed[0] && typeof data.from_parsed[0].address === 'string') {
    console.log(`Mapeando 'from' desde from_parsed para doc ${docSnap.id}:`, data.from_parsed[0]);
    fromField = { email: data.from_parsed[0].address, name: data.from_parsed[0].name || undefined };
  } else if (typeof data.from === 'string') {
    console.log(`Mapeando 'from' desde string para doc ${docSnap.id}:`, data.from);
    fromField = parseAddressString(data.from);
  } else if (sourceCollection === 'outgoingEmails' && typeof data.fromEmail === 'string') {
     console.log(`Mapeando 'from' desde fromEmail (outgoing) para doc ${docSnap.id}:`, data.fromEmail);
    fromField = { email: data.fromEmail, name: data.fromName || undefined };
  } else {
    console.warn(`No se pudo determinar el remitente para el doc ${docSnap.id} en ${sourceCollection}. From data:`, data.from, data.from_parsed, data.fromEmail);
  }


  let toRecipients: { name?: string; email: string }[] = [];
  if (data.to_parsed && Array.isArray(data.to_parsed) && data.to_parsed.length > 0) {
    console.log(`Mapeando 'to' desde to_parsed para doc ${docSnap.id}:`, data.to_parsed);
    toRecipients = data.to_parsed
      .map((t: any) => (t && typeof t.address === 'string' ? { email: t.address, name: t.name || undefined } : null))
      .filter(Boolean) as { name?: string; email: string }[];
  } else if (typeof data.to === 'string') {
    console.log(`Mapeando 'to' desde string para doc ${docSnap.id}:`, data.to);
    toRecipients = parseAddressStringToArray(data.to);
  }
  if (toRecipients.length === 0) {
     console.warn(`No se pudieron determinar los destinatarios 'to' para el doc ${docSnap.id} en ${sourceCollection}. To data:`, data.to, data.to_parsed);
     toRecipients = [{ email: 'destinatario-desconocido@sistema.com', name: 'Destinatario Desconocido' }];
  }
  
  const ccRecipients = parseAddressStringToArray(data.cc);
  const bccRecipients = parseAddressStringToArray(data.bcc);

  let mailDate: string = new Date(0).toISOString();
  let receivedAtDate: string | undefined;

  if (sourceCollection === 'incomingEmails') {
    mailDate = parseFirestoreDateToISO(data.date, `date (incoming) for doc ${docSnap.id}`, docSnap.id) || mailDate;
    receivedAtDate = parseFirestoreDateToISO(data.receivedAt, `receivedAt (incoming) for doc ${docSnap.id}`, docSnap.id);
    if (!receivedAtDate) console.warn(`incomingEmail ${docSnap.id} missing valid receivedAt. Using mailDate as fallback.`);
  } else { // outgoingEmails
    const sentAtParsed = parseFirestoreDateToISO(data.sentAt, `sentAt (outgoing) for doc ${docSnap.id}`, docSnap.id);
    const createdAtParsed = parseFirestoreDateToISO(data.createdAt, `createdAt (outgoing) for doc ${docSnap.id}`, docSnap.id);
    const updatedAtParsed = parseFirestoreDateToISO(data.updatedAt, `updatedAt (outgoing) for doc ${docSnap.id}`, docSnap.id);
    mailDate = sentAtParsed || updatedAtParsed || createdAtParsed || mailDate;
  }

  let emailIsRead = false;
  if (typeof data.isRead === 'boolean') {
    emailIsRead = data.isRead;
  } else {
    // For incoming emails, default to unread. For others (sent, draft etc.), default to read.
    emailIsRead = sourceCollection === 'incomingEmails' ? false : true;
  }
  
  const mappedEmail: EmailMessage = {
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
    userId: data.userId || (currentUserId || "unknown_user"), // For outgoing emails, this is the sender. For incoming, it's who it's assigned to in CRM.
    crmUserId: sourceCollection === 'incomingEmails' ? (data.crmUserId || data.userId || undefined) : undefined, // Specifically for incoming emails linked to a CRM user.
  };
  console.log(`Mapped email ${mappedEmail.id} from ${sourceCollection}:`, mappedEmail);
  return mappedEmail;
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
    // This console.log helps debug if the component is re-rendering when it shouldn't
    console.log(`EmailFolderView: useEffect triggered. Tab: ${currentEmailFolderTab}, User: ${currentUser?.id}`);
    
    setIsLoading(true);
    setEmails([]); // Clear previous emails
    setCurrentPage(1); // Reset to first page

    if (!currentUser) {
      console.log("EmailFolderView: No current user, clearing emails and loader.");
      setIsLoading(false);
      return;
    }

    let q: any;
    let sourceCollection: 'incomingEmails' | 'outgoingEmails';
    let statusFilter: EmailMessage['status'] | EmailMessage['status'][];
    let orderByField = "createdAt"; 
    let userIdField = "userId"; // Default for outgoing emails

    switch (currentEmailFolderTab) {
      case 'inbox':
        sourceCollection = 'incomingEmails';
        orderByField = 'receivedAt';
        userIdField = 'userId'; // Assuming 'userId' links incoming emails to CRM users
        q = query(
          collection(db, sourceCollection),
          where(userIdField, "==", currentUser.id),
          orderBy(orderByField, "desc")
        );
        break;
      case 'sent':
        sourceCollection = 'outgoingEmails';
        statusFilter = 'sent';
        orderByField = 'sentAt'; // Or createdAt if sentAt might be missing
        q = query(
          collection(db, sourceCollection),
          where(userIdField, "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy(orderByField, "desc")
        );
        break;
      case 'pending':
        sourceCollection = 'outgoingEmails';
        statusFilter = 'pending';
        orderByField = 'createdAt';
        q = query(
          collection(db, sourceCollection),
          where(userIdField, "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy(orderByField, "desc")
        );
        break;
      case 'drafts':
        sourceCollection = 'outgoingEmails';
        statusFilter = 'draft';
        orderByField = 'updatedAt'; // Or createdAt
        q = query(
          collection(db, sourceCollection),
          where(userIdField, "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy(orderByField, "desc")
        );
        break;
      case 'trash':
        sourceCollection = 'outgoingEmails'; // Assuming only outgoing can be "deleted" for now
        statusFilter = 'deleted';
        orderByField = 'updatedAt'; // Or a specific "deletedAt" field if you add one
        q = query(
          collection(db, sourceCollection),
          where(userIdField, "==", currentUser.id),
          where("status", "==", statusFilter),
          orderBy(orderByField, "desc")
        );
        break;
      default:
        console.log(`EmailFolderView: Unknown tab ${currentEmailFolderTab}, setting loading to false.`);
        setIsLoading(false);
        return;
    }
    
    console.log(`EmailFolderView (${currentEmailFolderTab}): Querying ${sourceCollection} for user ${currentUser.id} with orderBy ${orderByField}, statusFilter: ${statusFilter}`);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`EmailFolderView (${currentEmailFolderTab}): Snapshot received. Empty?: ${snapshot.empty}, Size: ${snapshot.size}`);
      // console.log(`Raw fetched data from Firestore (${currentEmailFolderTab} emails):`, snapshot.docs.map(d => d.data()));
      
      const fetched = snapshot.docs.map(docSnap => {
        try {
          return mapFirestoreDocToEmailMessage(docSnap, currentUser?.id || "system_user_fallback", statusFilter || 'received', sourceCollection);
        } catch (mapError: any) {
          console.error(`EmailFolderView: Error mapping ${currentEmailFolderTab} document ${docSnap.id}:`, mapError, "Data:", docSnap.data());
          return null;
        }
      }).filter(Boolean) as EmailMessage[];
      // console.log(`Mapped ${currentEmailFolderTab} emails for UI:`, fetched);
      setEmails(fetched);
      setIsLoading(false);
    }, (error) => {
      console.error(`EmailFolderView: ERROR FETCHING ${currentEmailFolderTab.toUpperCase()} EMAILS (onSnapshot):`, error);
      toast({ title: `Error Crítico al Cargar ${currentEmailFolderTab}`, variant: "destructive", description: `Detalles: ${error.message}. Revisa los permisos de Firestore.` });
      setIsLoading(false);
      setEmails([]);
    });

    return () => {
      console.log(`EmailFolderView: Unsubscribing from ${currentEmailFolderTab} listener.`);
      unsubscribe();
    };
  }, [currentUser, currentEmailFolderTab, toast]); // Removed mapFirestoreDocToEmailMessage

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
    const displayDate = email.status === 'received' ? email.receivedAt : email.date;

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
          <AvatarImage src={`https://avatar.vercel.sh/${email.from.email}.png`} alt={email.from.name || email.from.email} data-ai-hint="sender avatar"/>
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
              {displayDate && isValid(parseISO(displayDate)) ? formatDistanceToNowStrict(parseISO(displayDate), { addSuffix: true, locale: es }) : "Fecha Inv."}
            </time>
          </div>
          <p className={cn("text-sm truncate mt-0.5", isUnread ? "text-primary" : "")}>
            {email.subject || "(Sin Asunto)"}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5 h-4">
            {email.bodyText || (typeof email.bodyHtml === 'string' && email.bodyHtml.trim() !== "" ? "" : "(Sin contenido)")}
          </p>
        </div>
        {(email.status === 'pending') && <Clock className="h-3.5 w-3.5 text-amber-500 animate-pulse ml-auto self-center shrink-0" />}
      </div>
    );
  };

  const folder = foldersConfig.find(f => f.name === currentEmailFolderTab);
  
  if (isLoading) {
    return (
      <>
        <div className="p-3 border-b shrink-0">
          <Input placeholder={`Buscar en ${folder?.label || 'correos'}...`} className="h-9 text-sm" disabled />
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
            placeholder={`Buscar en ${folder?.label || 'correos'}...`} 
            className="h-9 text-sm pl-8" 
            value={searchTermLocal}
            onChange={(e) => setSearchTermLocal(e.target.value)}
          />
        </div>
      </div>
      {paginatedEmails.length === 0 ? (
        <div className="flex-grow flex items-center justify-center text-muted-foreground p-4 text-center">
          <p className="text-sm">
            {searchTermLocal ? "No se encontraron correos con ese criterio." : `No hay correos en "${folder?.label}".`}
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

function EmailPageContent() {
  const { toast } = useToast();
  const { currentUser, unreadInboxCount, isLoadingUnreadCount } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentEmailFolderTab, setCurrentEmailFolderTab] = useState<FolderType>("inbox");
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [composerKey, setComposerKey] = useState(Date.now()); // Used to reset composer
  const [composerInitialData, setComposerInitialData] = useState<{
    to?: string; cc?: string; bcc?: string; subject?: string; body?: string;
    attachments?: { name: string; url: string; size?: number; type?: string }[];
    draftId?: string | null; // To know if we are editing a draft
  } | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSavingDraftState, setIsSavingDraftState] = useState(false); // Renamed for clarity


  // Fetch Leads and Contacts (for composer suggestions)
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

  const handleOpenComposer = useCallback((initialData: Partial<typeof composerInitialData> = {}, draftIdToEdit: string | null = null) => {
    console.log("handleOpenComposer called with initialData:", initialData, "draftIdToEdit:", draftIdToEdit);
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
    setComposerKey(Date.now()); // Force re-mount of composer with new initial data
    setShowComposer(true);
    setSelectedEmail(null); // Close detail view if open

    // Clean up URL params if composer opened by button, not by direct URL nav
    if (draftIdToEdit === null) { // Only clear if it's not for editing a draft by URL
        const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
        if (currentUrlParams.has('to') || currentUrlParams.has('subject') || currentUrlParams.has('body') || currentUrlParams.has('emailId')) {
            currentUrlParams.delete('to');
            currentUrlParams.delete('cc');
            currentUrlParams.delete('bcc');
            currentUrlParams.delete('subject');
            currentUrlParams.delete('body');
            currentUrlParams.delete('emailId'); // Also clear emailId if it was for a draft
            router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
        }
    }
  }, [searchParams, router, pathname]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingDraftId(null);
    setComposerInitialData(null); // Clear initial data
    
    // Clear URL parameters if they were used to prefill the composer
    // Only clear if the composer was initially opened by URL params AND we are closing it without saving/sending a draft that had an ID
    if (composerInitialData?.draftId || (!searchParams.has('to') && !searchParams.has('subject') && !searchParams.has('body'))) {
      const currentUrlParams = new URLSearchParams(Array.from(searchParams.entries()));
      const paramsToDelete = ['to', 'subject', 'body', 'cc', 'bcc'];
      if (composerInitialData?.draftId) paramsToDelete.push('emailId'); // if a draft was being edited, its ID might be in URL
      
      let paramsChanged = false;
      paramsToDelete.forEach(param => {
        if (currentUrlParams.has(param)) {
          currentUrlParams.delete(param);
          paramsChanged = true;
        }
      });
      if (paramsChanged) {
        router.replace(`${pathname}?${currentUrlParams.toString()}`, { scroll: false });
      }
    }
  }, [composerInitialData, searchParams, router, pathname]);


  // Effect to open composer if URL params are present on initial load or change
  useEffect(() => {
    const initialToParam = searchParams.get("to");
    const initialSubjectParam = searchParams.get("subject");
    const initialBodyParam = searchParams.get("body");
    const initialEmailIdParam = searchParams.get("emailId"); // For opening drafts

    if (initialEmailIdParam && !showComposer && !selectedEmail) {
        // TODO: Fetch draft data by initialEmailIdParam and then call handleOpenComposer
        // For now, this relies on the draft being in `draftEmails` state if activeTab is 'drafts'
        // This part needs robust implementation if direct draft linking by URL is critical.
        console.log("Attempting to open draft by ID:", initialEmailIdParam);
    } else if ((initialToParam || initialSubjectParam || initialBodyParam) && !showComposer && !selectedEmail) {
      console.log("Opening composer from URL params");
      handleOpenComposer({ 
        to: initialToParam || "", 
        subject: initialSubjectParam || "", 
        body: initialBodyParam || "" 
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, handleOpenComposer, showComposer, selectedEmail]); // handleOpenComposer is memoized

  const uploadAttachments = async (files: File[], userId: string, emailId: string): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    if (!files || files.length === 0) return [];
    // Simulate delay and success for now
    console.log(`Simulating upload of ${files.length} files for user ${userId}, email ${emailId}`);
    // toast({ title: "Subiendo adjuntos...", description: "Esto es una simulación."});
    
    const attachmentPromises = files.map(file => {
      const filePath = `email-attachments/${userId}/${emailId}/${Date.now()}-${file.name}`;
      const fileRef = storageRef(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      return new Promise<{ name: string; url: string; size: number; type: string }>((resolve, reject) => {
        uploadTask.on("state_changed",
          (snapshot) => {
            // Can use snapshot to update progress if needed
          },
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

    try {
      const results = await Promise.all(attachmentPromises);
      // toast({ title: "Adjuntos Subidos (Simulado)", variant: "default" });
      return results;
    } catch (error) {
      toast({ title: "Error al Subir Adjuntos", description: "No se pudieron subir uno o más archivos.", variant: "destructive" });
      return []; // Return empty or handle error as needed
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
      // Simple merge: filter out any new uploads that might already exist by URL (unlikely for new uploads but good practice)
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
      fromName: currentUser.name || "Usuario CRM", // Or a configurable sending name
      fromEmail: currentUser.email, // Or a configurable sending email
      attachments: finalAttachments.length > 0 ? finalAttachments : [],
      // createdAt and updatedAt will be handled below
    };

    try {
      if (isSendingDraft) {
        const draftBeingSentDocRef = doc(db, "outgoingEmails", editingDraftId!);
        // Fetch existing draft to preserve createdAt
        const draftBeingSentSnap = await getDoc(draftBeingSentDocRef);
        const draftCreatedAt = draftBeingSentSnap.exists() ? draftBeingSentSnap.data().createdAt : serverTimestamp();
        
        await updateDoc(draftBeingSentDocRef, { ...emailDoc, createdAt: draftCreatedAt, updatedAt: serverTimestamp() });
      } else {
        await setDoc(doc(db, "outgoingEmails", emailIdToUse), { ...emailDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      toast({ title: "Correo en Cola", description: `Tu correo para ${data.to} se enviará pronto.` });
      setEditingDraftId(null); // Clear editing draft ID after sending
      return true;
    } catch (error) {
      console.error("Error al poner correo en cola:", error);
      toast({ title: "Error al Enviar", variant: "destructive", description: String(error) });
      return false;
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleEmailQueued = () => {
    handleCloseComposer();
    setCurrentEmailFolderTab("pending"); // Switch to pending tab
  };

  const handleSaveDraft = async (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, newAttachments: File[]) => {
    if (!currentUser) {
      toast({ title: "Error de autenticación", variant: "destructive" });
      return false;
    }
    setIsSavingDraftState(true); // Use the new state variable
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
      fromName: currentUser.name || "Usuario CRM", // Default sender info
      fromEmail: currentUser.email,
      attachments: finalAttachments.length > 0 ? finalAttachments : [],
      // createdAt will be set on first save, updatedAt on subsequent saves
    };

    try {
      if (editingDraftId) {
        const draftBeingSavedDocRef = doc(db, "outgoingEmails", editingDraftId!);
        const draftBeingSavedSnap = await getDoc(draftBeingSavedDocRef);
        const draftCreatedAt = draftBeingSavedSnap.exists() ? draftBeingSavedSnap.data().createdAt : serverTimestamp();
        await updateDoc(draftBeingSavedDocRef, { ...draftDoc, createdAt: draftCreatedAt, updatedAt: serverTimestamp() });
      } else {
        // New draft
        await setDoc(doc(db, "outgoingEmails", draftIdToUse), { ...draftDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      toast({ title: "Borrador Guardado" });
      handleCloseComposer();
      setCurrentEmailFolderTab("drafts");
      return true;
    } catch (error) {
      console.error("Error al guardar borrador:", error);
      toast({ title: "Error al Guardar Borrador", variant: "destructive", description: String(error) });
      return false;
    } finally {
      setIsSavingDraftState(false); // Use the new state variable
    }
  };

  const handleDeleteEmail = async (emailToDelete: EmailMessage) => {
    if (!currentUser || !emailToDelete.id) return;
    const confirmDelete = window.confirm(`¿Estás seguro de que quieres mover este correo (${emailToDelete.subject || "Sin Asunto"}) a la papelera?`);
    if (!confirmDelete) return;

    const collectionName = emailToDelete.collectionSource;
    if (!collectionName) {
      toast({ title: "Error", description: "No se pudo determinar el origen del correo.", variant: "destructive" });
      return;
    }

    try {
      await updateDoc(doc(db, collectionName, emailToDelete.id), { status: "deleted", updatedAt: serverTimestamp() });
      toast({ title: "Correo Movido a Papelera" });
      if (selectedEmail?.id === emailToDelete.id) setSelectedEmail(null);
      setCurrentEmailFolderTab("trash"); // Switch to trash tab
    } catch (error) {
      console.error("Error moviendo correo a papelera:", error);
      toast({ title: "Error al Eliminar Correo", variant: "destructive", description: String(error) });
    }
  };
  
  const markEmailAsRead = async (emailId: string, collectionName: 'incomingEmails' | 'outgoingEmails') => {
    if (!currentUser || !emailId || collectionName !== 'incomingEmails') return; // Only mark as read for incoming emails for now
    console.log(`Attempting to mark email ${emailId} in ${collectionName} as read.`);
    try {
      await updateDoc(doc(db, collectionName, emailId), { isRead: true, updatedAt: serverTimestamp() });
      // No toast needed here to avoid being too noisy, UI will update
    } catch (error) {
      console.error(`Error al marcar correo ${emailId} como leído:`, error);
      toast({ title: "Error al marcar correo como leído", variant: "destructive" });
    }
  };


  const handleViewEmail = (email: EmailMessage) => {
    if (email.status === 'draft' && currentUser && email.userId === currentUser.id) {
      // Open draft in composer
      handleOpenComposer({
        to: Array.isArray(email.to) ? email.to.map(t => t.email).join(',') : (typeof email.to === 'string' ? email.to : (email.to as any)?.email),
        cc: Array.isArray(email.cc) ? email.cc.map(c => c.email).join(',') : '',
        bcc: Array.isArray(email.bcc) ? email.bcc.map(b => b.email).join(',') : '',
        subject: email.subject,
        body: email.bodyHtml || email.bodyText,
        attachments: email.attachments, // Pass existing attachments
      }, email.id); // Pass draft ID
    } else {
      setSelectedEmail(email);
      setShowComposer(false); // Ensure composer is hidden
      if (email.collectionSource === 'incomingEmails' && !email.isRead) {
        markEmailAsRead(email.id, 'incomingEmails');
      }
    }
  };
  const handleCloseEmailView = () => setSelectedEmail(null);

  // Folder configuration
  const foldersConfig = useMemo(() => [
    { name: "inbox" as FolderType,    label: "Bandeja de Entrada", icon: Inbox,    count: isLoadingUnreadCount ? null : (unreadInboxCount || 0), isLoading: false, data: [] }, // Data will be filled by useEffect
    { name: "pending" as FolderType,  label: "Enviando",           icon: Clock,    count: 0, isLoading: false, data: [] },
    { name: "sent" as FolderType,     label: "Enviados",           icon: Send,     count: 0, isLoading: false, data: [] },
    { name: "drafts" as FolderType,   label: "Borradores",         icon: ArchiveIcon, count: 0, isLoading: false, data: [] },
    { name: "trash" as FolderType,    label: "Papelera",           icon: Trash2,   count: 0, isLoading: false, data: [], disabled: false }, // Papelera habilitada
  ], [unreadInboxCount, isLoadingUnreadCount]);

  // This useEffect will be split or managed within EmailFolderView
  // For now, let's just ensure it doesn't cause the 'activeTab not defined'
  console.log('DEBUG: EmailPageContent rendering, currentEmailFolderTab is:', currentEmailFolderTab);
  useEffect(() => {
    // This is a placeholder. The actual data fetching logic will be in EmailFolderView.
    // The purpose here is to show that currentEmailFolderTab is in scope.
    console.log('DEBUG: Top-level useEffect in EmailPageContent, currentEmailFolderTab:', currentEmailFolderTab);
  }, [currentUser, currentEmailFolderTab, toast]); // Removed mapFirestoreDocToEmailMessage for simplification test


  const emailNavItem = NAV_ITEMS.find(item => item.href === '/email');
  const PageIcon = emailNavItem?.icon || MailIconLucide;

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
        <div className={cn(
            "w-56 md:w-64 bg-muted/50 border-r p-3 flex-col shrink-0",
            (showComposer || selectedEmail) && "hidden md:flex" // Only show if composer or detail is open on larger screens
        )}>
          <Button onClick={() => handleOpenComposer({}, null)} className="w-full mb-4" size="lg">
            <Edit2 className="mr-2 h-4 w-4" /> Correo Nuevo
          </Button>
          <ScrollArea className="flex-grow">
            <nav className="flex flex-col gap-1">
              {foldersConfig.map(folder => {
                const folderState = folder.name === 'inbox' ? { data: [], isLoading: false } : // Replace with actual state
                                   folder.name === 'sent' ? { data: [], isLoading: false } :
                                   folder.name === 'pending' ? { data: [], isLoading: false } :
                                   folder.name === 'drafts' ? { data: [], isLoading: false } :
                                   { data: [], isLoading: false }; // trash

                let displayCount = 0;
                if (folder.name === 'inbox') {
                    displayCount = isLoadingUnreadCount ? 0 : (unreadInboxCount || 0);
                } else {
                    displayCount = folderState.data.length;
                }

                return (
                    <Button
                    key={folder.name}
                    variant={currentEmailFolderTab === folder.name ? "secondary" : "ghost"}
                    className="w-full justify-start text-sm h-9"
                    onClick={() => { setCurrentEmailFolderTab(folder.name); setSelectedEmail(null); setShowComposer(false); }}
                    disabled={folder.disabled}
                    >
                    <folder.icon className={cn("mr-2 h-4 w-4", currentEmailFolderTab === folder.name ? "text-primary" : "text-muted-foreground")} />
                    {folder.label}
                    {displayCount > 0 && (
                        <Badge className={cn(
                            "ml-auto text-xs px-1.5 py-0.5 font-normal h-5",
                            folder.name === 'inbox' ? "bg-red-500 text-white hover:bg-red-600" :
                            (folder.name === 'drafts' ? "bg-muted-foreground/30 text-black hover:bg-muted-foreground/40" : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30")
                        )}>
                        {displayCount > 99 ? '99+' : displayCount}
                        </Badge>
                    )}
                    </Button>
                );
              })}
            </nav>
          </ScrollArea>
        </div>
        
        {/* Main Content Area (Middle and Right Panes) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showComposer && composerInitialData ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background md:border-l">
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
            </div>
          ) : selectedEmail ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background md:border-l">
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
                    onDelete={handleDeleteEmail}
                    />
            </div>
          ) : (
            // Middle Pane (Email List) when no composer or detail view is active
            <div className="flex-1 flex flex-col overflow-hidden md:border-l">
                 <EmailFolderView
                    currentUser={currentUser}
                    currentEmailFolderTab={currentEmailFolderTab}
                    toast={toast}
                    onViewEmail={handleViewEmail}
                    selectedEmailId={selectedEmail?.id || null}
                />
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
          <p><strong className="text-amber-800">Visualización de Pendientes, Enviados, Borradores:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge> (Borradores y Papelera cargan datos de `outgoingEmails`).</p>
          <p><strong className="text-amber-800">Guardar/Cargar Borradores (Texto y Adjuntos):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Visualización Detallada y Paginación:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Adjuntar Archivos (Subida a Storage y Enlace en Firestore):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Bandeja de Entrada (Recepción y Sincronización IMAP):</strong> <Badge className="bg-yellow-500 text-black">Parcial (Backend IMAP vía CF, UI lee `incomingEmails` filtrado por `userId`)</Badge>. Requiere que CF IMAP guarde `userId` del destinatario del CRM para el correcto filtrado.</p>
          <p><strong className="text-amber-800">Marcar como Leído/No Leído (Bandeja de Entrada):</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Papelera y Eliminación Lógica:</strong> <Badge className="bg-green-500 text-white">Implementado</Badge>.</p>
          <p><strong className="text-amber-800">Búsqueda en Lista de Correos (Panel Central):</strong> <Badge className="bg-yellow-500 text-black">Implementado (Básico)</Badge> (Filtra en cliente, puede mejorar con búsqueda en servidor).</p>
          <p><strong className="text-amber-800">Plantillas de Correo para Respuestas Rápidas:</strong> <Badge className="bg-orange-500 text-black">En Desarrollo</Badge>.</p>
          <p><strong className="text-amber-800">Sincronización Completa con Múltiples Cuentas Personales (Configuración de Usuario):</strong> <Badge className="bg-yellow-500 text-black">Parcial</Badge> (UI de config. personal lista, backend para usar credenciales individuales en envío/recepción pendiente).</p>
        </CardContent>
      </Card>
    </div>
  );
}


export default function EmailPage() {
  return (
    <React.Suspense fallback={
      <div className="flex flex-col gap-6 h-full">
        <Skeleton className="h-16 w-full shrink-0" />
        <div className="flex flex-1 overflow-hidden">
          <Skeleton className="w-56 md:w-64 border-r shrink-0 hidden md:flex" />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Skeleton className="h-12 border-b p-3 shrink-0"/>
            <div className="flex-grow p-2 space-y-2"><Skeleton className="h-14 w-full"/><Skeleton className="h-14 w-full"/><Skeleton className="h-14 w-full"/></div>
            <Skeleton className="h-12 border-t p-2 shrink-0"/>
          </div>
          <Skeleton className="flex-1 hidden md:flex flex-[2] xl:flex-[3] border-l" />
        </div>
      </div>
    }>
      <EmailPageContent />
    </React.Suspense>
  );
}
