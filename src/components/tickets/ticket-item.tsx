
"use client";

import type { Ticket, Lead, User, TicketPriority, TicketStatus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit3, Trash2, User as UserIcon, CalendarDays, LinkIcon, ShieldAlert, CheckCircle2, Waypoints, XCircle } from "lucide-react";
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TicketItemProps {
  ticket: Ticket;
  leads: Lead[];
  users: User[];
  onEdit: (ticket: Ticket) => void;
  onDelete: (ticketId: string) => void; // Assuming delete functionality might be added
}

export function TicketItem({ ticket, leads, users, onEdit, onDelete }: TicketItemProps) {
  const relatedLead = ticket.relatedLeadId ? leads.find(l => l.id === ticket.relatedLeadId) : null;
  const reporter = users.find(u => u.id === ticket.reporterUserId);
  const assignee = ticket.assigneeUserId ? users.find(u => u.id === ticket.assigneeUserId) : null;

  const getPriorityBadge = (priority: TicketPriority) => {
    switch (priority) {
      case 'Alta': return <Badge variant="destructive" className="capitalize flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> {priority}</Badge>;
      case 'Media': return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white capitalize">{priority}</Badge>;
      case 'Baja': return <Badge variant="secondary" className="capitalize">{priority}</Badge>;
      default: return <Badge variant="outline" className="capitalize">{priority}</Badge>;
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'Abierto': return <Badge variant="outline" className="border-blue-500 text-blue-500 flex items-center gap-1"><Waypoints className="h-3 w-3" /> {status}</Badge>;
      case 'En Progreso': return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600 text-white flex items-center gap-1"><Waypoints className="h-3 w-3" /> {status}</Badge>;
      case 'Resuelto': return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {status}</Badge>;
      case 'Cerrado': return <Badge variant="secondary" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> {status}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const UserAvatarTooltip = ({ user }: { user?: User }) => {
    if (!user) return <span className="text-xs text-muted-foreground">N/A</span>;
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar className="h-6 w-6">
              <AvatarImage src={user.avatarUrl} alt={user.name} data-ai-hint="user avatar" />
              <AvatarFallback>{user.name.substring(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            <p>{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };


  return (
    <Card className={`transition-all duration-200 shadow-sm hover:shadow-md ${ticket.status === 'Cerrado' ? 'bg-muted/50 opacity-80' : 'bg-card'}`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className={`text-lg ${ticket.status === 'Cerrado' ? 'line-through text-muted-foreground' : ''}`}>{ticket.title}</CardTitle>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => onEdit(ticket)} className="h-8 w-8" aria-label="Editar ticket">
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(ticket.id)} className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Eliminar ticket">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          ID: {ticket.id}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className={`text-sm mt-1 mb-3 ${ticket.status === 'Cerrado' ? 'text-muted-foreground/80' : 'text-muted-foreground'}`}>
          {ticket.description.length > 150 ? `${ticket.description.substring(0, 147)}...` : ticket.description}
        </p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5" title="Estado">
            {getStatusBadge(ticket.status)}
          </div>
          <div className="flex items-center gap-1.5" title="Prioridad">
            {getPriorityBadge(ticket.priority)}
          </div>
          <div className="flex items-center gap-1.5" title="Creado el">
            <CalendarDays className="h-4 w-4" />
            <span>{format(parseISO(ticket.createdAt), "PP", { locale: es })}</span>
          </div>
          {ticket.updatedAt && (
            <div className="flex items-center gap-1.5" title="Actualizado el">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              <span>{format(parseISO(ticket.updatedAt), "PP", { locale: es })}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5" title="Reportado por">
            <UserIcon className="h-4 w-4" />
            <UserAvatarTooltip user={reporter} />
          </div>
          <div className="flex items-center gap-1.5" title="Asignado a">
            <UserIcon className="h-4 w-4 text-green-500" />
             {assignee ? <UserAvatarTooltip user={assignee} /> : <span className="text-xs text-muted-foreground">Sin asignar</span>}
          </div>

          {relatedLead && (
            <div className="flex items-center gap-1.5 col-span-full sm:col-span-1" title="Lead Relacionado">
              <LinkIcon className="h-4 w-4 text-primary" />
              <span className="truncate">Lead: {relatedLead.name}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
