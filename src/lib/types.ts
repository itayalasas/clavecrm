
import type { LucideIcon as LucideIconType } from 'lucide-react'; // Renamed to avoid conflict if LucideIcon is used as a type elsewhere

export type UserRole = 'admin' | 'supervisor' | 'empleado' | 'analista' | 'desarrollador' | 'vendedor' | 'user';

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  stageId: string;
  createdAt: string; // Store as ISO string for easier serialization
  details?: string;
  value?: number; // Potential deal value
  score?: number; // For lead scoring
  probability?: number; // 0-100 for sales forecast
  expectedCloseDate?: string; // ISO string for sales forecast
}

export interface PipelineStage {
  id:string;
  name: string;
  order: number;
  color?: string; // Optional color for the stage
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // Store as ISO string
  completed: boolean;
  relatedLeadId?: string;
  createdAt: string; // Store as ISO string
  priority?: 'low' | 'medium' | 'high';
  assigneeUserId?: string; // ID of the user assigned to the task
  reporterUserId: string; // ID of the user who reported or created the task
  solutionDescription?: string; // Description of the solution
  attachments?: { name: string, url: string }[]; // Array of attachment objects
  isMonthlyRecurring?: boolean; // For tasks that recur monthly on the first day
}

export type TicketStatus = 'Abierto' | 'En Progreso' | 'Resuelto' | 'Cerrado';
export type TicketPriority = 'Alta' | 'Media' | 'Baja';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole; // Updated to use UserRole
  groups?: string[]; // IDs of groups the user belongs to
}

export interface Comment {
  id: string;
  userId: string;
  userName: string; // Denormalized for easier display
  userAvatarUrl?: string | null; // Denormalized for easier display, can be null
  text: string;
  createdAt: string; // ISO string
  attachments?: { name: string, url: string }[];
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string
  reporterUserId: string; // ID of the user who created the ticket
  assigneeUserId?: string; // ID of the user assigned to the ticket
  relatedLeadId?: string; // Optional: link ticket to a lead
  attachments?: { name: string, url: string }[]; // Attachments for the ticket itself
  solutionDescription?: string; // Description of the solution provided by assignee
  solutionAttachments?: { name: string, url: string }[]; // Attachments for the solution
}

// Sales Management Types
export type QuoteStatus = 'Borrador' | 'Enviada' | 'Aceptada' | 'Rechazada' | 'Expirada';
export type OrderStatus = 'Pendiente' | 'Procesando' | 'Enviado' | 'Entregado' | 'Cancelado';
export type InvoiceStatus = 'Borrador' | 'Enviada' | 'Pagada' | 'Vencida' | 'Cancelada';

export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: string;
  leadId: string;
  createdAt: string;
  updatedAt?: string;
  quoteNumber: string;
  items: QuoteItem[];
  subtotal: number;
  discount?: number; // Percentage or fixed amount
  taxRate?: number; // e.g., 0.21 for 21%
  taxAmount: number;
  total: number;
  status: QuoteStatus;
  notes?: string;
  validUntil?: string; // ISO string
  preparedByUserId: string;
}

export interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  leadId: string;
  quoteId?: string; // Associated quote ID
  orderNumber: string;
  createdAt: string;
  updatedAt?: string;
  items: OrderItem[];
  subtotal: number;
  discount?: number;
  taxAmount: number; // Typically orders don't have taxAmount directly, it's on invoice. But can be stored if needed.
  total: number;
  status: OrderStatus;
  shippingAddress?: string;
  billingAddress?: string;
  placedByUserId: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  orderId: string;
  leadId: string;
  invoiceNumber: string;
  createdAt: string; // Issue date
  updatedAt?: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  discount?: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  status: InvoiceStatus;
  paymentMethod?: string;
  paymentDate?: string; // ISO string
  notes?: string;
  issuedByUserId: string;
}

// Email Campaign Types
export interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
  subscribed?: boolean; // Made optional as it might not always be present
  createdAt: string; // ISO string
  listIds?: string[]; // IDs of ContactList this contact belongs to
  customFields?: Record<string, any>; // For custom data
}

export interface ContactList {
  id: string;
  name: string;
  description?: string;
  createdAt: string; // ISO string
  contactCount?: number; // Denormalized, can be updated via triggers
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  contentHtml?: string;
  contentText?: string;
  variables?: string[]; // e.g. ["{{firstName}}", "{{companyName}}"]
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string
  previewImageUrl?: string; // Optional
}

export type EmailCampaignStatus = 'Borrador' | 'Programada' | 'Enviando' | 'Enviada' | 'Archivada' | 'Fallida';

export interface EmailCampaignAnalytics {
  totalRecipients: number;
  emailsSent: number;
  emailsDelivered?: number;
  emailsOpened?: number;
  uniqueOpens?: number;
  emailsClicked?: number;
  uniqueClicks?: number;
  bounceCount?: number;
  unsubscribeCount?: number;
  spamReports?: number;
  deliveryRate?: number;
  openRate?: number;
  clickThroughRate?: number;
  clickToOpenRate?: number;
  unsubscribeRate?: number;
  bounceRate?: number;
}

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  contactListId: string;
  emailTemplateId: string;
  status: EmailCampaignStatus;
  scheduledAt?: string; // ISO string
  sentAt?: string; // ISO string
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string
  analytics: EmailCampaignAnalytics;
}

// Types for new email template features
export interface PredefinedEmailTemplate {
  id: string;
  name: string;
  description: string;
  contentHtml: string;
}

export interface CommonEmailVariable {
  variable: string;
  description: string;
}

// System Settings Types
export type SMTPSecurity = 'None' | 'SSL' | 'TLS';

export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecurity: SMTPSecurity;
  defaultSenderEmail: string;
  defaultSenderName: string;
  sendRateLimit?: number; // e.g., emails per hour
}

// Collaboration and Productivity Types
export type MeetingStatus = 'Programada' | 'Confirmada' | 'Cancelada' | 'Realizada' | 'Pospuesta';

// Use a more specific type for ActivityType based on constants
export type ActivityType = 'Llamada' | 'Reunión' | 'Correo Enviado' | 'Correo Recibido' | 'Nota' | 'Visita';


export interface MeetingAttendee {
  id: string; // Can be userId or contactId or a unique ID for an external guest
  type: 'user' | 'contact' | 'external';
  name: string; // Denormalized name
  email: string; // Denormalized email
  status: 'Aceptada' | 'Rechazada' | 'Pendiente' | 'Tentativa';
}

export interface Resource {
  id: string;
  name: string;
  type: 'Sala de Reuniones' | 'Proyector' | 'Pizarra Digital' | 'Otro';
  description?: string;
  location?: string;
  capacity?: number;
  isAvailable?: boolean; // Basic availability flag
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  attendees: MeetingAttendee[];
  location?: string; // Can be a physical address or "Videollamada"
  conferenceLink?: string; // For online meetings
  relatedLeadId?: string;
  relatedTicketId?: string;
  createdByUserId: string;
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string
  status: MeetingStatus;
  reminderSent?: boolean;
  resourceId?: string; // ID of the selected resource
}

export interface Opportunity { // Added Opportunity type for relatedOpportunityId
    id: string;
    name: string;
    // Add other relevant fields for Opportunity
}


export interface ActivityLog {
  id: string;
  type: ActivityType;
  subject?: string;
  details: string;
  timestamp: string; // ISO string - when the activity occurred or was logged
  loggedByUserId: string;
  relatedLeadId?: string;
  relatedContactId?: string;
  relatedOpportunityId?: string; // Added relatedOpportunityId
  relatedTicketId?: string;
  relatedOrderId?: string;
  durationMinutes?: number; // For calls/meetings
  outcome?: string;
  createdAt: string; // ISO string - when the log entry was created
}

export interface DocumentVersion {
  version: number;
  fileURL: string;
  fileNameInStorage: string;
  uploadedAt: string; // ISO string
  uploadedByUserId: string;
  uploadedByUserName: string; // Denormalized for display
  notes?: string; // Optional notes for this specific version (general description of changes)
  fileSize: number;
  fileType: string;
  versionNotes?: string; // Specific notes for the upload event of this version
}

export type DocumentPermissionLevel = 'view' | 'edit';

export interface DocumentUserPermission {
  userId: string;
  userName: string; // Name of the user
  email: string;    // Email of the user, for avatar or contact
  avatarUrl?: string | null; // Optional avatar URL
  level: DocumentPermissionLevel;
}

export interface DocumentGroupPermission {
  groupId: string;
  groupName: string; // Name of the group
  level: DocumentPermissionLevel;
}

export interface DocumentFile {
  id: string;
  name: string; // Original file name presented to user
  fileNameInStorage: string; // Name used in Firebase Storage (e.g., with UUID/timestamp)
  fileURL: string; // Download URL from Firebase Storage for the current version
  fileType: string; // MIME type of the current version
  fileSize: number; // in bytes of the current version
  description?: string;
  tags?: string[];

  uploadedAt: string; // ISO string - upload date of the *first* version
  uploadedByUserId: string; // User who uploaded the *first* version
  uploadedByUserName: string; // Denormalized for display - user who uploaded *first* version

  lastVersionUploadedAt?: string; // ISO string - upload date of the *current* version
  lastVersionUploadedByUserId?: string; // User who uploaded the *current* version
  lastVersionUploadedByUserName?: string; // Denormalized - user who uploaded *current* version

  relatedLeadId?: string | null; // Allow null for Firestore
  relatedContactId?: string | null; // Allow null for Firestore
  relatedOpportunityId?: string | null;
  relatedOrderId?: string | null;
  relatedQuoteId?: string | null;
  relatedTicketId?: string | null;
  relatedProjectId?: string | null;

  currentVersion: number;
  versionHistory?: DocumentVersion[];

  isPublic?: boolean; // If true, fileURL can be considered a public share link
  accessKey?: string; // A unique key for more controlled sharing (future)

  permissions?: {
    users?: DocumentUserPermission[];
    groups?: DocumentGroupPermission[];
  } | null;

  basedOnTemplateId?: string | null; // ID of the DocumentTemplate used to generate this document
  templateVariablesFilled?: Record<string, string> | null; // Values used for template variables during generation
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string; // e.g., "Contratos", "Propuestas de Venta", "Informes"
  content?: string; // For simple text/markdown templates. For complex, might be a link or reference to a file in storage.
  variables?: string[]; // e.g. {{lead_name}}, {{company_name}}
  createdAt: string; // ISO string
  createdByUserId: string;
  updatedAt?: string; // ISO string
  fileNameInStorage?: string | null; // If the template is a file
  fileURL?: string | null; // If the template is a file
  fileType?: string | null; // MIME type if template is a file
}

// LucideIcon type definition, using the renamed import
export type LucideIcon = LucideIconType;

// User Group (placeholder, to be defined properly if group management is implemented)
export interface UserGroup {
    id: string;
    name: string;
    description?: string;
    memberIds?: string[]; // Array of User IDs
    // other group-specific fields
}
    
