"use client";

import type { Task, Lead } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit3, Trash2, CalendarDays, User, LinkIcon } from "lucide-react";
import { format, parseISO, differenceInDays } from 'date-fns';

interface TaskItemProps {
  task: Task;
  leads: Lead[];
  onToggleComplete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

export function TaskItem({ task, leads, onToggleComplete, onEdit, onDelete }: TaskItemProps) {
  const relatedLead = task.relatedLeadId ? leads.find(l => l.id === task.relatedLeadId) : null;
  
  const getDueDateBadge = () => {
    if (!task.dueDate) return null;
    const dueDate = parseISO(task.dueDate);
    const today = new Date();
    const daysDiff = differenceInDays(dueDate, today);

    if (task.completed) return <Badge variant="outline">Completed</Badge>;
    if (daysDiff < 0) return <Badge variant="destructive">Overdue</Badge>;
    if (daysDiff === 0) return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white">Due Today</Badge>;
    if (daysDiff <= 3) return <Badge variant="secondary" className="bg-yellow-400 hover:bg-yellow-500 text-black">Due Soon</Badge>;
    return <Badge variant="outline">Due {format(dueDate, "MMM d")}</Badge>;
  };

  const getPriorityBadge = () => {
    if (!task.priority) return null;
    switch (task.priority) {
      case 'high': return <Badge variant="destructive" className="capitalize">{task.priority}</Badge>;
      case 'medium': return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white capitalize">{task.priority}</Badge>;
      case 'low': return <Badge variant="secondary" className="capitalize">{task.priority}</Badge>;
      default: return <Badge variant="outline" className="capitalize">{task.priority}</Badge>;
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
          aria-label={task.completed ? "Mark task as incomplete" : "Mark task as complete"}
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
                <CalendarDays className="h-3 w-3" /> {format(parseISO(task.dueDate), "PP")}
              </span>
            )}
            {getDueDateBadge()}
            {getPriorityBadge()}
            {relatedLead && (
              <span className="flex items-center gap-1 p-1 px-1.5 bg-secondary rounded-md">
                <LinkIcon className="h-3 w-3 text-primary" /> Linked to: {relatedLead.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => onEdit(task)} className="h-8 w-8" aria-label="Edit task">
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)} className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete task">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
