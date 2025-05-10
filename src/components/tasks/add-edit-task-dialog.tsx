
"use client";

import { useState, useEffect } from "react";
import type { Task, Lead, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from 'date-fns/locale'; 
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";


interface AddEditTaskDialogProps {
  trigger: React.ReactNode;
  taskToEdit?: Task | null;
  leads: Lead[];
  users: User[]; 
  onSave: (task: Task) => void;
}

const defaultTask: Omit<Task, 'id' | 'createdAt' | 'reporterUserId'> = {
  title: "",
  description: "",
  dueDate: undefined,
  completed: false,
  relatedLeadId: undefined,
  priority: 'medium',
  assigneeUserId: undefined,
};

const NO_LEAD_SELECTED_VALUE = "__no_lead_selected__";
const NO_USER_SELECTED_VALUE = "__no_user_selected__";

export function AddEditTaskDialog({ trigger, taskToEdit, leads, users, onSave }: AddEditTaskDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { currentUser } = useAuth();
  
  const [formData, setFormData] = useState<Omit<Task, 'id' | 'createdAt'>>({
    ...defaultTask,
    reporterUserId: taskToEdit ? taskToEdit.reporterUserId : (currentUser?.id || ""),
    assigneeUserId: taskToEdit ? taskToEdit.assigneeUserId : (currentUser?.id || undefined) // Default to current user or undefined
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (taskToEdit) {
      setFormData({
        title: taskToEdit.title,
        description: taskToEdit.description || "",
        dueDate: taskToEdit.dueDate,
        completed: taskToEdit.completed,
        relatedLeadId: taskToEdit.relatedLeadId || undefined,
        priority: taskToEdit.priority || 'medium',
        assigneeUserId: taskToEdit.assigneeUserId || undefined,
        reporterUserId: taskToEdit.reporterUserId, 
      });
      setSelectedDate(taskToEdit.dueDate ? parseISO(taskToEdit.dueDate) : undefined);
    } else {
      setFormData({
        ...defaultTask,
        reporterUserId: currentUser?.id || "", 
        assigneeUserId: currentUser?.id || undefined, // Default new tasks to current user or unassigned
      });
      setSelectedDate(undefined);
    }
  }, [taskToEdit, isOpen, currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: 'relatedLeadId' | 'priority' | 'assigneeUserId', value: string) => {
    if (name === 'relatedLeadId') {
      setFormData((prev) => ({ ...prev, relatedLeadId: value === NO_LEAD_SELECTED_VALUE ? undefined : value }));
    } else if (name === 'assigneeUserId') {
      setFormData((prev) => ({ ...prev, assigneeUserId: value === NO_USER_SELECTED_VALUE ? undefined : value }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value as Task['priority'] }));
    }
  };

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setFormData((prev) => ({ ...prev, dueDate: date ? date.toISOString() : undefined }));
  };

  const handleSubmit = () => {
    if (!formData.title) {
      alert("El título es obligatorio."); 
      return;
    }
    if (!currentUser?.id && !taskToEdit) { // Ensure reporterId is set if creating new
        alert("No se pudo identificar al usuario reportador. Intenta recargar la página.");
        return;
    }

    const newTaskData: Omit<Task, 'id' | 'createdAt'> = {
      ...formData,
      assigneeUserId: formData.assigneeUserId === NO_USER_SELECTED_VALUE ? undefined : formData.assigneeUserId,
      reporterUserId: taskToEdit ? formData.reporterUserId : (currentUser?.id || ""), // Ensure reporter is current user for new tasks
    };

    const finalTask: Task = {
      ...newTaskData,
      id: taskToEdit ? taskToEdit.id : `task-${Date.now()}`,
      createdAt: taskToEdit ? taskToEdit.createdAt : new Date().toISOString(),
    };
    onSave(finalTask);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{taskToEdit ? "Editar Tarea" : "Añadir Nueva Tarea"}</DialogTitle>
          <DialogDescription>
            {taskToEdit ? "Actualiza los detalles de esta tarea." : "Completa la información para la nueva tarea."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">Título</Label>
            <Input id="title" name="title" value={formData.title} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right pt-2">Descripción</Label>
            <Textarea id="description" name="description" value={formData.description || ""} onChange={handleChange} className="col-span-3" rows={3} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="dueDate" className="text-right">Fecha de Vencimiento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "col-span-3 justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  locale={es}
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="priority" className="text-right">Prioridad</Label>
            <Select name="priority" value={formData.priority} onValueChange={(value) => handleSelectChange('priority', value)}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="assigneeUserId" className="text-right">Asignar a</Label>
            <Select
              name="assigneeUserId"
              value={formData.assigneeUserId || NO_USER_SELECTED_VALUE}
              onValueChange={(value) => handleSelectChange('assigneeUserId', value)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona un usuario (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_USER_SELECTED_VALUE}>Sin asignar</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} {currentUser && user.id === currentUser.id ? "(Yo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="relatedLeadId" className="text-right">Lead Relacionado</Label>
            <Select
              name="relatedLeadId"
              value={formData.relatedLeadId || NO_LEAD_SELECTED_VALUE}
              onValueChange={(value) => handleSelectChange('relatedLeadId', value)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona un lead (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LEAD_SELECTED_VALUE}>Ninguno</SelectItem>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit}>Guardar Tarea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
