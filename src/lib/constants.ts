import type { Lead, PipelineStage, Task } from './types';
import { LayoutDashboard, BarChartBig, ListChecks, Sparkles, Briefcase } from 'lucide-react';

export const APP_NAME = "CRM Rápido";
export const APP_ICON = Briefcase;

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Panel de Control', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Embudo de Ventas', icon: BarChartBig },
  { href: '/tasks', label: 'Tareas', icon: ListChecks },
  { href: '/ai-email-assistant', label: 'Asistente IA de Correo', icon: Sparkles },
];

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

export const INITIAL_TASKS: Task[] = [
  { id: 'task-1', title: 'Llamada de seguimiento con Acme Corp', dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-1', createdAt: new Date().toISOString(), priority: 'high' },
  { id: 'task-2', title: 'Preparar demo para Beta Solutions', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-2', createdAt: new Date().toISOString(), priority: 'medium' },
  { id: 'task-3', title: 'Enviar borrador del informe Q1 a los interesados', completed: true, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), priority: 'low', dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'task-4', title: 'Investigar competidores de Delta Services', dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-4', createdAt: new Date().toISOString(), priority: 'medium' },
];
