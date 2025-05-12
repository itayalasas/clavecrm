
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
export type TicketPriority = 'Baja' | 'Media' | 'Alta';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string; 
  role: UserRole; // Updated to use UserRole
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
export type ActivityType = 'Llamada' | 'Reunión' | 'Correo Enviado' | 'Correo Recibido' | 'Nota' | 'Visita';

export interface MeetingAttendee {
  userId?: string; // If CRM user
  contactId?: string; // If external contact
  name: string; // Denormalized name
  email: string; // Denormalized email
  status: 'Aceptada' | 'Rechazada' | 'Pendiente' | 'Tentativa';
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
}

export interface ActivityLog {
  id: string;
  type: ActivityType;
  subject?: string; // e.g., "Llamada de seguimiento", "Email sobre propuesta"
  details: string; // Content of the note, summary of the call/meeting, email body snippet
  timestamp: string; // ISO string - when the activity occurred or was logged
  loggedByUserId: string; // User who logged the activity
  relatedLeadId?: string;
  relatedContactId?: string; // Could be derived from Lead or direct contact
  relatedTicketId?: string;
  relatedOrderId?: string;
  durationMinutes?: number; // For calls/meetings
  outcome?: string; // e.g., "Interesado", "Necesita seguimiento", "Problema resuelto"
  createdAt: string; // ISO string - when the log entry was created
}

export interface DocumentFile {
  id: string;
  name: string; // Original file name
  storagePath: string; // Path in Firebase Storage
  fileUrl: string; // Download URL
  fileType: string; // MIME type
  fileSize: number; // in bytes
  version?: string;
  description?: string;
  relatedLeadId?: string;
  relatedQuoteId?: string;
  relatedOrderId?: string;
  relatedInvoiceId?: string;
  relatedTicketId?: string;
  uploadedAt: string; // ISO string
  uploadedByUserId: string;
  tags?: string[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string; // e.g., "Contratos", "Propuestas de Venta", "Informes"
  content?: string; // For simple text/markdown templates. For complex, might be a link or reference.
  storagePath?: string; // If the template itself is a file (e.g. .docx, .pdf template)
  variables?: string[]; // e.g. {{lead_name}}, {{company_name}}
  createdAt: string;
  createdByUserId: string;
  updatedAt?: string;
}

    