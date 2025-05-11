
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
  userAvatarUrl?: string; // Denormalized for easier display
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
  attachments?: { name: string, url: string }[];
  comments?: Comment[];
}
