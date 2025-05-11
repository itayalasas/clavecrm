
"use client";

import { useState, useEffect, useId, useCallback } from "react";
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Check, ChevronsUpDown, Paperclip } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { es } from 'date-fns/locale'; 
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";


interface AddEditTaskDialogProps {
  trigger: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  taskToEdit?: Task | null;
  leads: Lead[];
  users: User[]; 
  onSave: (task: Task) => void;
}

const defaultTaskBase: Omit<Task, 'id' | 'createdAt' | 'reporterUserId'> = {
  title: "",
  description: "",
  dueDate: undefined,
  completed: false,
  relatedLeadId: undefined,
  priority: 'medium',
  assigneeUserId: undefined,
  solutionDescription: "",
  attachments: [],
};

const NO_LEAD_SELECTED_VALUE = "__no_lead_selected__";
const NO_USER_SELECTED_VALUE = "__no_user_selected__";

export function AddEditTaskDialog({ 
  trigger, 
  isOpen: controlledIsOpen, 
  onOpenChange: controlledOnOpenChange, 
  taskToEdit, 
  leads, 
  users, 
  onSave 
}: AddEditTaskDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isDialogOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsDialogOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalIsOpen;
  
  const { currentUser } = useAuth();
  const dialogId = useId(); 

  const getInitialFormData = useCallback(() => {
    if (taskToEdit) {
      return {
        id: taskToEdit.id,
        createdAt: taskToEdit.createdAt,
        title: taskToEdit.title,
        description: taskToEdit.description || "",
        dueDate: taskToEdit.dueDate, 
        completed: taskToEdit.completed,
        relatedLeadId: taskToEdit.relatedLeadId || undefined,
        priority: taskToEdit.priority || 'medium',
        assigneeUserId: taskToEdit.assigneeUserId || undefined,
        reporterUserId: taskToEdit.reporterUserId,
        solutionDescription: taskToEdit.solutionDescription || "",
        attachments: taskToEdit.attachments || [],
      };
    }
    return {
      ...defaultTaskBase,
      reporterUserId: currentUser?.id || "", 
      assigneeUserId: currentUser?.id || undefined, 
    };
  }, [taskToEdit, currentUser]);
  
  const [formData, setFormData] = useState<Partial<Task>>(getInitialFormData());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    taskToEdit && taskToEdit.dueDate && isValid(parseISO(taskToEdit.dueDate)) ? parseISO(taskToEdit.dueDate) : undefined
  );
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);


  useEffect(() => {
    if (isDialogOpen) {
      const initialData = getInitialFormData();
      setFormData(initialData);
      setSelectedDate(initialData.dueDate && initialData.dueDate && isValid(parseISO(initialData.dueDate)) ? parseISO(initialData.dueDate) : undefined);
    }
  }, [isDialogOpen, taskToEdit, currentUser, getInitialFormData]);

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
    if (!currentUser?.id && !taskToEdit) { 
        alert("No se pudo identificar al usuario reportador. Intenta recargar la página.");
        return;
    }

    const taskToSave: Task = {
      id: taskToEdit ? taskToEdit.id : '', 
      createdAt: taskToEdit ? taskToEdit.createdAt : new Date().toISOString(),
      title: formData.title!,
      description: formData.description || "",
      dueDate: formData.dueDate, 
      completed: formData.completed || false,
      relatedLeadId: formData.relatedLeadId === NO_LEAD_SELECTED_VALUE ? undefined : formData.relatedLeadId,
      priority: formData.priority || 'medium',
      assigneeUserId: formData.assigneeUserId === NO_USER_SELECTED_VALUE ? undefined : formData.assigneeUserId,
      reporterUserId: taskToEdit ? formData.reporterUserId! : currentUser!.id,
      solutionDescription: formData.solutionDescription || "",
      // For now, attachments are not fully implemented with file upload
      attachments: formData.attachments || [], 
    };

    onSave(taskToSave);
    // setIsDialogOpen(false); // Parent component will handle closing the dialog via onSave callback
  };

  let assigneeNameDisplay = "Selecciona un usuario (opcional)";
  if (formData.assigneeUserId && formData.assigneeUserId !== NO_USER_SELECTED_VALUE) {
    const user = users.find(u => u.id === formData.assigneeUserId);
    if (user) {
      assigneeNameDisplay = user.name;
      if (currentUser && user.id === currentUser.id) {
        assigneeNameDisplay += " (Yo)";
      }
    } else {
        assigneeNameDisplay = "Usuario no encontrado";
    }
  }

  const sortedUsers = users.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild onClick={() => !isDialogOpen && setIsDialogOpen(true)}>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{taskToEdit ? "Editar Tarea" : "Añadir Nueva Tarea"}</DialogTitle>
          <DialogDescription>
            {taskToEdit ? "Actualiza los detalles de esta tarea." : "Completa la información para la nueva tarea."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${dialogId}-title`} className="text-right">Título</Label>
            <Input id={`${dialogId}-title`} name="title" value={formData.title || ""} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={`${dialogId}-description`} className="text-right pt-2">Descripción</Label>
            <Textarea id={`${dialogId}-description`} name="description" value={formData.description || ""} onChange={handleChange} className="col-span-3" rows={3} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${dialogId}-dueDate`} className="text-right">Fecha de Vencimiento</Label>
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
            <Label htmlFor={`${dialogId}-priority`} className="text-right">Prioridad</Label>
            <Select name="priority" value={formData.priority || 'medium'} onValueChange={(value) => handleSelectChange('priority', value)}>
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
            <Label htmlFor={`${dialogId}-assigneeUserId`} className="text-right">Asignar a</Label>
            <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={assigneePopoverOpen}
                  className="col-span-3 justify-between font-normal"
                >
                  {assigneeNameDisplay}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
                <Command>
                  <CommandInput placeholder="Buscar usuario por nombre..." />
                  <CommandList>
                    <CommandEmpty>No se encontró usuario.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        key={NO_USER_SELECTED_VALUE}
                        value={NO_USER_SELECTED_VALUE}
                        onSelect={() => {
                          handleSelectChange('assigneeUserId', NO_USER_SELECTED_VALUE);
                          setAssigneePopoverOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            (formData.assigneeUserId === NO_USER_SELECTED_VALUE || !formData.assigneeUserId) ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Sin asignar
                      </CommandItem>
                      {sortedUsers.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={user.name} 
                          onSelect={(currentValue) => {
                            const selectedUserObj = sortedUsers.find(u => u.name.toLowerCase() === currentValue.toLowerCase());
                            if (selectedUserObj) {
                              handleSelectChange('assigneeUserId', selectedUserObj.id);
                            } else if (currentValue === NO_USER_SELECTED_VALUE) { 
                               handleSelectChange('assigneeUserId', NO_USER_SELECTED_VALUE);
                            }
                            setAssigneePopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              formData.assigneeUserId === user.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {user.name} {currentUser && user.id === currentUser.id ? "(Yo)" : ""}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${dialogId}-relatedLeadId`} className="text-right">Lead Relacionado</Label>
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
          
          {taskToEdit && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor={`${dialogId}-solutionDescription`} className="text-right pt-2">Descripción de la Solución</Label>
              <Textarea id={`${dialogId}-solutionDescription`} name="solutionDescription" value={formData.solutionDescription || ""} onChange={handleChange} className="col-span-3" rows={3} placeholder="Detalla la solución aplicada a esta tarea..."/>
            </div>
          )}

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={`${dialogId}-attachments`} className="text-right pt-2">Adjuntos</Label>
            <div className="col-span-3">
              <Input 
                id={`${dialogId}-attachments`} 
                name="attachments" 
                type="file" 
                className="mb-2"
                disabled // Full file upload not implemented yet
                onChange={(e) => {
                  // Placeholder for future file handling
                  // if (e.target.files && e.target.files.length > 0) {
                  //   // For now, storing the file name as a simple string.
                  //   // In a real app, this would involve uploading to Firebase Storage and storing URLs.
                  //   setFormData(prev => ({...prev, attachments: [...(prev.attachments || []), e.target.files![0].name]}));
                  // }
                }}
                />
              <p className="text-xs text-muted-foreground">
                La subida de archivos no está implementada completamente. Este campo es un marcador de posición.
                {formData.attachments && formData.attachments.length > 0 && (
                  <span className="block mt-1">Archivos actuales (simulado): {formData.attachments.join(", ")}</span>
                )}
              </p>
            </div>
          </div>

        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit}>Guardar Tarea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

