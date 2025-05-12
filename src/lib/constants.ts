
import type { Lead, PipelineStage, Task, User, TicketStatus, TicketPriority, UserRole, QuoteStatus, OrderStatus, InvoiceStatus, EmailCampaignStatus, PredefinedEmailTemplate, CommonEmailVariable, MeetingStatus, ActivityLogUserActivityType, ActivityLogSystemAuditActionType, Resource } from './types';
import { LayoutDashboard, BarChartBig, ListChecks, Sparkles, Briefcase, ClipboardList, Users as UsersIcon, FileText, ShoppingCart, Receipt, Send, Zap, LayoutTemplate, Share2, Settings, DollarSign, Target, LifeBuoy, SlidersHorizontal, LucideIcon, ChevronDown, UsersRound, CalendarDays, FileClock, FolderKanban, Library, HistoryIcon, Brain, MessagesSquare, Smile } from 'lucide-react';

export const APP_NAME = "CRM Rápido";
export const APP_ICON = Briefcase;

export type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  subItems?: NavItem[];
  disabled?: boolean; // For features not yet implemented
  parentActiveIf?: (pathname: string) => boolean; // Optional: custom logic for parent active state
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Panel de Control', icon: LayoutDashboard },
  {
    label: 'Ventas',
    icon: DollarSign,
    subItems: [
      { href: '/pipeline', label: 'Embudo de Ventas', icon: BarChartBig },
      { href: '/quotes', label: 'Cotizaciones', icon: FileText },
      { href: '/orders', label: 'Pedidos', icon: ShoppingCart },
      { href: '/invoices', label: 'Facturas', icon: Receipt },
    ],
    parentActiveIf: (pathname) => ['/pipeline', '/quotes', '/orders', '/invoices'].some(p => pathname.startsWith(p)),
  },
  {
    label: 'Marketing',
    icon: Target,
    subItems: [
      { href: '/ai-email-assistant', label: 'Asistente IA de Correo', icon: Sparkles },
      { href: '/email-campaigns', label: 'Campañas de Email', icon: Send },
      { href: '/marketing-automation', label: 'Automatización Marketing', icon: Zap, disabled: true },
      { href: '/landing-pages', label: 'Landing Pages y Formularios', icon: LayoutTemplate, disabled: true },
      { href: '/social-crm', label: 'Social CRM', icon: Share2, disabled: true },
    ],
    parentActiveIf: (pathname) => ['/ai-email-assistant', '/email-campaigns', '/marketing-automation', '/landing-pages', '/social-crm'].some(p => pathname.startsWith(p)),
  },
  {
    label: 'Colaboración y Productividad',
    icon: UsersRound,
    subItems: [
      { href: '/calendar', label: 'Calendario y Reuniones', icon: CalendarDays },
      { href: '/activity-log', label: 'Registro de Actividades', icon: FileClock },
      { href: '/documents', label: 'Gestión de Documentos', icon: FolderKanban },
      { href: '/tasks', label: 'Tareas', icon: ListChecks },
    ],
    parentActiveIf: (pathname) => ['/calendar', '/activity-log', '/documents', '/tasks'].some(p => pathname.startsWith(p)),
  },
  {
    label: 'Soporte al Cliente',
    icon: LifeBuoy,
    subItems: [
      { href: '/tickets', label: 'Gestión de Tickets', icon: ClipboardList },
      { href: '/knowledge-base', label: 'Base de Conocimiento', icon: Brain, disabled: true },
      { href: '/live-chat', label: 'Chat en Vivo / Chatbots', icon: MessagesSquare, disabled: true },
      { href: '/satisfaction-surveys', label: 'Encuestas de Satisfacción', icon: Smile, disabled: true },
    ],
    parentActiveIf: (pathname) => ['/tickets', '/knowledge-base', '/live-chat', '/satisfaction-surveys'].some(p => pathname.startsWith(p)),
  },
  {
    label: 'Administración',
    icon: SlidersHorizontal,
    subItems: [
      { href: '/user-management', label: 'Gestión de Usuarios', icon: UsersIcon },
      { href: '/settings', label: 'Configuración', icon: Settings },
      { href: '/audit-log', label: 'Historial de Auditoría', icon: HistoryIcon },
    ],
    parentActiveIf: (pathname) => ['/user-management', '/settings', '/audit-log'].some(p => pathname.startsWith(p)),
  },
];


export const USER_ROLES: UserRole[] = ['admin', 'supervisor', 'empleado', 'analista', 'desarrollador', 'vendedor', 'user'];
export const DEFAULT_USER_ROLE: UserRole = 'user';


export const INITIAL_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'stage-1', name: 'Nuevo Lead', order: 1, color: 'bg-sky-500' },
  { id: 'stage-2', name: 'Contactado', order: 2, color: 'bg-blue-500' },
  { id: 'stage-3', name: 'Propuesta Enviada', order: 3, color: 'bg-amber-500' },
  { id: 'stage-4', name: 'Negociación', order: 4, color: 'bg-purple-500' },
  { id: 'stage-5', name: 'Cerrado Ganado', order: 5, color: 'bg-green-500' },
  { id: 'stage-6', name: 'Cerrado Perdido', order: 6, color: 'bg-red-500' },
];

const today = new Date();
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
};

export const INITIAL_LEADS: Lead[] = [
  {
    id: 'lead-1', name: 'Acme Corp', email: 'contact@acme.com', stageId: 'stage-1',
    createdAt: new Date().toISOString(),
    details: 'Interesado en las funciones de automatización de marketing del Producto X.', value: 5000,
    score: 75, probability: 60, expectedCloseDate: addDays(today, 30)
  },
  {
    id: 'lead-2', name: 'Beta Solutions', email: 'info@beta.inc', stageId: 'stage-2',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    details: 'Seguimiento del presupuesto Q2. Necesita integración personalizada.', value: 12000,
    score: 90, probability: 75, expectedCloseDate: addDays(today, 45)
  },
  {
    id: 'lead-3', name: 'Gamma Innovations LLC', email: 'sales@gamma.llc', stageId: 'stage-3',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    details: 'Propuesta enviada, esperando comentarios. Contacto clave: Jane Doe.', value: 7500,
    score: 60, probability: 50, expectedCloseDate: addDays(today, 60)
  },
  {
    id: 'lead-4', name: 'Delta Services', email: 'support@delta.com', stageId: 'stage-1',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    details: 'Buscando CRM para 10 usuarios.', value: 3000,
    score: 50, probability: 30, expectedCloseDate: addDays(today, 15)
  },
  {
    id: 'lead-5', name: 'Epsilon Retail', email: 'shop@epsilon.store', stageId: 'stage-4',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    details: 'Negociando términos para el plan empresarial.', value: 25000,
    score: 85, probability: 80, expectedCloseDate: addDays(today, 10)
  },
];

export const INITIAL_USERS: User[] = [
  { id: 'user-1', name: 'Juan Pérez', email: 'juan.perez@example.com', avatarUrl: 'https://picsum.photos/seed/juan/100/100', role: 'user' },
  { id: 'user-2', name: 'Maria García', email: 'maria.garcia@example.com', avatarUrl: 'https://picsum.photos/seed/maria/100/100', role: 'supervisor' },
  { id: 'user-3', name: 'Carlos Rodríguez', email: 'carlos.rodriguez@example.com', avatarUrl: 'https://picsum.photos/seed/carlos/100/100', role: 'admin' },
];

export const INITIAL_TASKS: Task[] = [
  { id: 'task-1', title: 'Llamada de seguimiento con Acme Corp', dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-1', createdAt: new Date().toISOString(), priority: 'high', reporterUserId: 'user-1', assigneeUserId: 'user-2' },
  { id: 'task-2', title: 'Preparar demo para Beta Solutions', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-2', createdAt: new Date().toISOString(), priority: 'medium', reporterUserId: 'user-1', assigneeUserId: 'user-1' },
  { id: 'task-3', title: 'Enviar borrador del informe Q1 a los interesados', completed: true, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), priority: 'low', dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), reporterUserId: 'user-2' },
  { id: 'task-4', title: 'Investigar competidores de Delta Services', dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-4', createdAt: new Date().toISOString(), priority: 'medium', reporterUserId: 'user-1', assigneeUserId: 'user-1' },
];


export const TICKET_STATUSES: TicketStatus[] = ['Abierto', 'En Progreso', 'Resuelto', 'Cerrado'];
export const TICKET_PRIORITIES: TicketPriority[] = ['Baja', 'Media', 'Alta'];

export const QUOTE_STATUSES: QuoteStatus[] = ['Borrador', 'Enviada', 'Aceptada', 'Rechazada', 'Expirada'];
export const ORDER_STATUSES: OrderStatus[] = ['Pendiente', 'Procesando', 'Enviado', 'Entregado', 'Cancelado'];
export const INVOICE_STATUSES: InvoiceStatus[] = ['Borrador', 'Enviada', 'Pagada', 'Vencida', 'Cancelada'];
export const EMAIL_CAMPAIGN_STATUSES: EmailCampaignStatus[] = ['Borrador', 'Programada', 'Enviando', 'Enviada', 'Archivada', 'Fallida'];

export const PREDEFINED_EMAIL_TEMPLATES: PredefinedEmailTemplate[] = [
  {
    id: 'basic-welcome',
    name: 'Bienvenida Básica',
    description: 'Un correo simple de bienvenida para nuevos suscriptores.',
    contentHtml: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h1>¡Bienvenido/a, {{nombre_contacto}}!</h1>
        <p>Gracias por unirte a nuestra comunidad. Estamos emocionados de tenerte con nosotros.</p>
        <p>Pronto recibirás más información y novedades.</p>
        <p>Saludos,<br/>El Equipo de {{nombre_empresa_remitente}}</p>
      </div>
    `,
  },
  {
    id: 'simple-promo',
    name: 'Promoción Simple',
    description: 'Plantilla básica para anunciar una promoción o descuento.',
    contentHtml: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; text-align: center;">
        <h1 style="color: #29ABE2;">¡Oferta Especial para Ti, {{nombre_contacto}}!</h1>
        <p>No te pierdas nuestro descuento exclusivo del <strong>20%</strong> en todos nuestros productos.</p>
        <p>Usa el código: <strong>PROMO20</strong></p>
        <p><a href="#" style="background-color: #29ABE2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Comprar Ahora</a></p>
        <p style="font-size: 0.9em; color: #777;">Oferta válida hasta {{fecha_fin_oferta}}.</p>
      </div>
    `,
  },
  {
    id: 'newsletter-update',
    name: 'Actualización de Newsletter',
    description: 'Estructura para un boletín informativo con un artículo principal.',
    contentHtml: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px;">
        <header style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #1976D2;">{{nombre_empresa_remitente}} | Newsletter</h1>
        </header>
        <section>
          <h2>Hola {{nombre_contacto}},</h2>
          <p>Aquí tienes las últimas novedades:</p>
          <h3>{{titulo_articulo_principal}}</h3>
          <p>{{resumen_articulo_principal}}</p>
          <p><a href="{{enlace_articulo_principal}}" style="color: #1976D2;">Leer más...</a></p>
        </section>
        <footer style="text-align: center; margin-top: 30px; font-size: 0.9em; color: #777;">
          <p>&copy; ${new Date().getFullYear()} {{nombre_empresa_remitente}}. Todos los derechos reservados.</p>
          <p><a href="{{enlace_desuscripcion}}" style="color: #777;">Darse de baja</a></p>
        </footer>
      </div>
    `,
  },
];

export const COMMON_EMAIL_VARIABLES: CommonEmailVariable[] = [
  { variable: "{{nombre_contacto}}", description: "Nombre completo del contacto." },
  { variable: "{{email_contacto}}", description: "Dirección de correo electrónico del contacto." },
  { variable: "{{nombre_empresa_remitente}}", description: "Nombre de tu empresa (remitente)." },
  { variable: "{{enlace_desuscripcion}}", description: "Enlace para que el contacto se dé de baja (requiere implementación)." },
  { variable: "{{nombre_campana}}", description: "Nombre de la campaña actual." },
  { variable: "{{fecha_actual}}", description: "Fecha actual del envío." },
];

export const MEETING_STATUSES: MeetingStatus[] = ['Programada', 'Confirmada', 'Cancelada', 'Realizada', 'Pospuesta'];

export const ACTIVITY_LOG_USER_ACTIVITY_TYPES: readonly ActivityLogUserActivityType[] = ['Llamada', 'Reunión', 'Correo Enviado', 'Correo Recibido', 'Nota', 'Visita'] as const;

export const AUDIT_ACTION_TYPES: readonly ActivityLogSystemAuditActionType[] = ['create', 'update', 'delete', 'login', 'logout', 'config_change', 'access_change', 'file_upload', 'file_download'] as const;


export const INITIAL_RESOURCES: Resource[] = [
  { id: 'room-1', name: 'Sala de Conferencias A', type: 'Sala de Reuniones', location: 'Edificio Principal, Planta 1', capacity: 10, isAvailable: true },
  { id: 'room-2', name: 'Sala de Reuniones Pequeña B', type: 'Sala de Reuniones', location: 'Edificio Anexo, Planta Baja', capacity: 4, isAvailable: true },
  { id: 'projector-1', name: 'Proyector HD (P1)', type: 'Proyector', location: 'Almacén Equipos', isAvailable: true },
  { id: 'whiteboard-1', name: 'Pizarra Digital Interactiva', type: 'Pizarra Digital', location: 'Sala de Colaboración', isAvailable: false },
  { id: 'other-1', name: 'Catering Café Mañana', type: 'Otro', description: 'Servicio de café y bollería para reuniones matutinas.', isAvailable: true },
];

export const DOCUMENT_TEMPLATE_CATEGORIES: string[] = [
  "Propuestas de Venta",
  "Contratos de Servicio",
  "Acuerdos de Confidencialidad (NDA)",
  "Facturas Proforma",
  "Cartas de Presentación",
  "Informes de Progreso",
  "Otros",
];
