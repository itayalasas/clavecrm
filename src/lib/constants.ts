import type { Lead, PipelineStage, Task } from './types';
import { LayoutDashboard, BarChartBig, ListChecks, Sparkles, Briefcase } from 'lucide-react';

export const APP_NAME = "MiniCRM Express";
export const APP_ICON = Briefcase;

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Sales Pipeline', icon: BarChartBig },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/ai-email-assistant', label: 'AI Email Assistant', icon: Sparkles },
];

export const INITIAL_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'stage-1', name: 'New Lead', order: 1, color: 'bg-sky-500' },
  { id: 'stage-2', name: 'Contacted', order: 2, color: 'bg-blue-500' },
  { id: 'stage-3', name: 'Proposal Sent', order: 3, color: 'bg-amber-500' },
  { id: 'stage-4', name: 'Negotiation', order: 4, color: 'bg-purple-500' },
  { id: 'stage-5', name: 'Closed Won', order: 5, color: 'bg-green-500' },
  { id: 'stage-6', name: 'Closed Lost', order: 6, color: 'bg-red-500' },
];

export const INITIAL_LEADS: Lead[] = [
  { id: 'lead-1', name: 'Acme Corp', email: 'contact@acme.com', stageId: 'stage-1', createdAt: new Date().toISOString(), details: 'Interested in Product X marketing automation features.', value: 5000 },
  { id: 'lead-2', name: 'Beta Solutions', email: 'info@beta.inc', stageId: 'stage-2', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), details: 'Follow up on Q2 budget. Needs custom integration.', value: 12000 },
  { id: 'lead-3', name: 'Gamma Innovations LLC', email: 'sales@gamma.llc', stageId: 'stage-3', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), details: 'Sent proposal, awaiting feedback. Key contact: Jane Doe.', value: 7500 },
  { id: 'lead-4', name: 'Delta Services', email: 'support@delta.com', stageId: 'stage-1', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), details: 'Looking for CRM for 10 users.', value: 3000 },
  { id: 'lead-5', name: 'Epsilon Retail', email: 'shop@epsilon.store', stageId: 'stage-4', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), details: 'Negotiating terms for enterprise plan.', value: 25000 },
];

export const INITIAL_TASKS: Task[] = [
  { id: 'task-1', title: 'Follow up call with Acme Corp', dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-1', createdAt: new Date().toISOString(), priority: 'high' },
  { id: 'task-2', title: 'Prepare demo for Beta Solutions', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-2', createdAt: new Date().toISOString(), priority: 'medium' },
  { id: 'task-3', title: 'Send Q1 report draft to stakeholders', completed: true, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), priority: 'low', dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'task-4', title: 'Research Delta Services competitors', dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), completed: false, relatedLeadId: 'lead-4', createdAt: new Date().toISOString(), priority: 'medium' },
];
