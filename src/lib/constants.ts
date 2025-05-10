
import type { Lead, PipelineStage, Task, Ticket, User, TicketStatus, TicketPriority, UserRole } from './types';
import { LayoutDashboard, BarChartBig, ListChecks, Sparkles, Briefcase, ClipboardList } from 'lucide-react';

export const APP_NAME = "CRM Rápido";
export const APP_ICON = Briefcase;

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Panel de Control', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Embudo de Ventas', icon: BarChartBig },
  { href: '/tasks', label: 'Tareas', icon: ListChecks },
  { href: '/tickets', label: 'Gestión de Tickets', icon: ClipboardList },
  { href: '/ai-email-assistant', label: 'Asistente IA de Correo', icon: Sparkles },
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

export const INITIAL_LEADS: Lead[] = [
  { id: 'lead-1', name: 'Acme Corp', email: 'contact@acme.com', stageId: 'stage-1', createdAt: new Date().toISOString(), details: 'Interesado en las funciones de automatización de marketing del Producto X.', value: 5000 },
  { id: 'lead-2', name: 'Beta Solutions', email: 'info@beta.inc', stageId: 'stage-2', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), details: 'Seguimiento del presupuesto Q2. Necesita integración personalizada.', value: 12000 },
  { id: 'lead-3', name: 'Gamma Innovations LLC', email: 'sales@gamma.llc', stageId: 'stage-3', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), details: 'Propuesta enviada, esperando comentarios. Contacto clave: Jane Doe.', value: 7500 },
  { id: 'lead-4', name: 'Delta Services', email: 'support@delta.com', stageId: 'stage-1', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), details: 'Buscando CRM para 10 usuarios.', value: 3000 },
  { id: 'lead-5', name: 'Epsilon Retail', email: 'shop@epsilon.store', stageId: 'stage-4', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), details: 'Negociando términos para el plan empresarial.', value: 25000 },
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

export const INITIAL_TICKETS: Ticket[] = [
  {
    id: 'ticket-1',
    title: 'Problema de acceso al portal de clientes',
    description: 'Varios clientes informan que no pueden acceder al portal de clientes desde ayer por la tarde. Parece ser un problema intermitente.',
    status: 'Abierto',
    priority: 'Alta',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    reporterUserId: 'user-1',
    assigneeUserId: 'user-2',
    relatedLeadId: 'lead-1',
  },
  {
    id: 'ticket-2',
    title: 'Error en la generación de facturas',
    description: 'El sistema muestra un error 500 al intentar generar facturas para clientes con suscripciones anuales.',
    status: 'En Progreso',
    priority: 'Alta',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    reporterUserId: 'user-2',
    assigneeUserId: 'user-2',
  },
  {
    id: 'ticket-3',
    title: 'Solicitud de nueva función: exportación a CSV',
    description: 'Un cliente (Beta Solutions) ha solicitado la posibilidad de exportar la lista de contactos a formato CSV.',
    status: 'Abierto',
    priority: 'Media',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    reporterUserId: 'user-1', 
    assigneeUserId: 'user-1',
    relatedLeadId: 'lead-2',
  },
  {
    id: 'ticket-4',
    title: 'Consulta sobre integración con API externa',
    description: 'Gamma Innovations LLC pregunta sobre las capacidades de nuestra API para integrarse con su sistema de inventario.',
    status: 'Resuelto',
    priority: 'Media',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    reporterUserId: 'user-3',
    assigneeUserId: 'user-3',
    relatedLeadId: 'lead-3',
  },
  {
    id: 'ticket-5',
    title: 'Contraseña olvidada - Epsilon Retail',
    description: 'El contacto principal de Epsilon Retail no puede acceder a su cuenta.',
    status: 'Cerrado',
    priority: 'Baja',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    reporterUserId: 'user-1',
    assigneeUserId: 'user-1',
    relatedLeadId: 'lead-5',
  }
];
