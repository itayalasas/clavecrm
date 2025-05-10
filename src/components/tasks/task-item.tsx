
"use client";

import type { Task, Lead, User } from "@/lib/types"; // Added User
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit3, Trash2, CalendarDays, User as UserIcon, LinkIcon } from "lucide-react"; // Renamed User to UserIcon
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale'; // Spanish locale for date-fns
import { CURRENT_USER_ID } from "@/lib/constants";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


interface TaskItemProps {
  task: Task;
  leads: Lead[];
  users: User[]; // Added users prop
  onToggleComplete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const UserAvatarTooltip = ({ user, labelPrefix }: { user?: User, labelPrefix?: string }) => {
  if (!user) return <span className="text-xs text-muted-foreground">N/A</span>;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {labelPrefix && <span className="text-xs">{labelPrefix}</span>}
            <Avatar className="h-5 w-5">
              <AvatarImage src={user.avatarUrl} alt={user.name} data-ai-hint="user avatar" />
              <AvatarFallback>{user.name.substring(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-xs hidden sm:inline">{user.name} {user.id === CURRENT_USER_ID ? "(Yo)" : ""}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};


export function TaskItem({ task, leads, users, onToggleComplete, onEdit, onDelete }: TaskItemProps) {
  const relatedLead = task.relatedLeadId ? leads.find(l => l.id === task.relatedLeadId) : null;
  const assignee = task.assigneeUserId ? users.find(u => u.id === task.assigneeUserId) : null;
  // const reporter = users.find(u => u.id === task.reporterUserId); // Reporter not actively displayed but could be useful
  
  const getDueDateBadge = () => {
    if (!task.dueDate) return null;
    const dueDate = parseISO(task.dueDate);
    const today = new Date();
    today.setHours(0,0,0,0); // Normalize today to start of day for accurate diff
    const daysDiff = differenceInDays(dueDate, today);

    if (task.completed) return <Badge variant="outline">Completada</Badge>;
    if (daysDiff < 0) return <Badge variant="destructive">Vencida</Badge>;
    if (daysDiff === 0) return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white">Vence Hoy</Badge>;
    if (daysDiff <= 3) return <Badge variant="secondary" className="bg-yellow-400 hover:bg-yellow-500 text-black">Vence Pronto</Badge>;
    return <Badge variant="outline">Vence {format(dueDate, "d MMM", { locale: es })}</Badge>;
  };

  const getPriorityBadge = () => {
    if (!task.priority) return null;
    let priorityText = task.priority;
    if (task.priority === 'high') priorityText = 'Alta';
    if (task.priority === 'medium') priorityText = 'Media';
    if (task.priority === 'low') priorityText = 'Baja';
    
    switch (task.priority) {
      case 'high': return <Badge variant="destructive" className="capitalize">{priorityText}</Badge>;
      case 'medium': return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white capitalize">{priorityText}</Badge>;
      case 'low': return <Badge variant="secondary" className="capitalize">{priorityText}</Badge>;
      default: return <Badge variant="outline" className="capitalize">{priorityText}</Badge>;
    }
  };

  return (
    <Card className={`transition-all duration-200 ${task.completed ? 'bg-muted/50 opacity-70' : 'bg-card'}`}>
      <CardContent className="p-4 flex items-start gap-4">
        <Checkbox
          id={`task-${task.id}`}
          checked={task.completed}
          onCheckedChange={() => onToggleComplete(task.id)}
          className="mt-1 shrink-0"
          aria-label={task.completed ? "Marcar tarea como incompleta" : "Marcar tarea como completa"}
        />
        <div className="flex-grow">
          <label
            htmlFor={`task-${task.id}`}
            className={`font-medium cursor-pointer ${task.completed ? "line-through text-muted-foreground" : "text-card-foreground"}`}
          >
            {task.title}
          </label>
          {task.description && (
            <p className={`text-sm mt-1 ${task.completed ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {format(parseISO(task.dueDate), "PP", { locale: es })}
              </span>
            )}
            {getDueDateBadge()}
            {getPriorityBadge()}
            {relatedLead && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 p-1 px-1.5 bg-secondary rounded-md hover:bg-secondary/80 cursor-default">
                      <LinkIcon className="h-3 w-3 text-primary" /> {relatedLead.name}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Enlazado a Lead: {relatedLead.name}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
             {assignee ? (
                <UserAvatarTooltip user={assignee} labelPrefix="Para:"/>
            ) : (
              <span className="flex items-center gap-1 p-1 px-1.5 bg-muted rounded-md text-xs">
                <UserIcon className="h-3 w-3" /> Sin asignar
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => onEdit(task)} className="h-8 w-8" aria-label="Editar tarea">
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)} className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Eliminar tarea">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
