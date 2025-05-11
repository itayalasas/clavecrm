
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { CalendarIcon, Check, ChevronsUpDown, Paperclip, UploadCloud, X, Repeat } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { es } from 'date-fns/locale'; 
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { storage, db } from "@/lib/firebase"; // Import storage
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, collection } from "firebase/firestore";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";


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
  isMonthlyRecurring: false,
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
  const { toast } = useToast();
  const dialogId = useId(); 

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
        isMonthlyRecurring: taskToEdit.isMonthlyRecurring || false,
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
      setSelectedDate(initialData.dueDate && isValid(parseISO(initialData.dueDate)) ? parseISO(initialData.dueDate) : undefined);
      setSelectedFile(null);
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [isDialogOpen, getInitialFormData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: 'isMonthlyRecurring', checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleRemoveAttachment = async (attachmentUrlToRemove: string) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este adjunto?")) return;
    
    try {
      const fileRef = storageRef(storage, attachmentUrlToRemove); // Firebase SDK can parse gs:// or https:// URLs
      await deleteObject(fileRef);
      setFormData(prev => ({
        ...prev,
        attachments: prev.attachments?.filter(url => url !== attachmentUrlToRemove) || []
      }));
      toast({ title: "Adjunto eliminado", description: "El archivo adjunto ha sido eliminado." });
    } catch (error: any) {
      console.error("Error eliminando adjunto:", error);
      if (error.code === 'storage/object-not-found') {
        // If file not found in storage, still remove it from DB
         setFormData(prev => ({
            ...prev,
            attachments: prev.attachments?.filter(url => url !== attachmentUrlToRemove) || []
          }));
        toast({ title: "Adjunto eliminado localmente", description: "El archivo no se encontró en el almacenamiento, pero se eliminó la referencia." });
      } else {
        toast({ title: "Error al eliminar adjunto", description: error.message, variant: "destructive" });
      }
    }
  };

  const handleSubmit = async () => {
    if (!formData.title) {
      toast({ title: "Error de validación", description: "El título es obligatorio.", variant: "destructive" });
      return;
    }
    if (!currentUser?.id && !taskToEdit) {
      toast({ title: "Error de autenticación", description: "No se pudo identificar al usuario. Intenta recargar la página.", variant: "destructive" });
      return;
    }

    let taskAttachments = formData.attachments || [];
    const taskId = taskToEdit ? taskToEdit.id : doc(collection(db, "tasks")).id;

    if (selectedFile) {
      setIsUploading(true);
      setUploadProgress(0);
      const filePath = `task-attachments/${currentUser!.id}/${taskId}/${Date.now()}-${selectedFile.name}`;
      const fileStorageRef = storageRef(storage, filePath);
      const uploadTask = uploadBytesResumable(fileStorageRef, selectedFile);

      try {
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => {
              console.error("Error al subir archivo:", error);
              toast({ title: "Error al Subir Archivo", description: error.message, variant: "destructive" });
              setIsUploading(false);
              reject(error);
            },
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              taskAttachments = [...taskAttachments, downloadURL]; // Add new URL
              setIsUploading(false);
              setSelectedFile(null); // Clear selected file after successful upload
              resolve();
            }
          );
        });
      } catch (error) {
        // Error already handled and toasted by the uploadTask's error callback
        return; // Stop submission if file upload failed
      }
    }

    const taskToSave: Task = {
      id: taskId,
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
      attachments: taskAttachments,
      isMonthlyRecurring: formData.isMonthlyRecurring || false,
    };

    onSave(taskToSave);
    // setIsDialogOpen(false); // Parent closes dialog
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
            <Input id={`${dialogId}-title`} name="title" value={formData.title || ""} onChange={handleChange} className="col-span-3" disabled={isUploading} />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={`${dialogId}-description`} className="text-right pt-2">Descripción</Label>
            <Textarea id={`${dialogId}-description`} name="description" value={formData.description || ""} onChange={handleChange} className="col-span-3" rows={3} disabled={isUploading} />
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
                  disabled={isUploading}
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
            <Select name="priority" value={formData.priority || 'medium'} onValueChange={(value) => handleSelectChange('priority', value)} disabled={isUploading}>
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
                  disabled={isUploading}
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
              disabled={isUploading}
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
          
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={`${dialogId}-solutionDescription`} className="text-right pt-2">Descripción de la Solución</Label>
            <Textarea id={`${dialogId}-solutionDescription`} name="solutionDescription" value={formData.solutionDescription || ""} onChange={handleChange} className="col-span-3" rows={3} placeholder="Detalla la solución aplicada a esta tarea..." disabled={isUploading} />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={`${dialogId}-attachments`} className="text-right pt-2">Adjuntos</Label>
            <div className="col-span-3 space-y-2">
              <Input 
                id={`${dialogId}-attachments`} 
                name="attachments" 
                type="file" 
                onChange={handleFileChange}
                className="mb-2"
                disabled={isUploading}
                accept="image/*,application/pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" 
              />
              {isUploading && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="w-full h-2" />
                  <p className="text-xs text-muted-foreground text-center">Subiendo archivo... {uploadProgress.toFixed(0)}%</p>
                </div>
              )}
              {selectedFile && !isUploading && (
                <p className="text-xs text-muted-foreground">Archivo seleccionado: {selectedFile.name}</p>
              )}
              {formData.attachments && formData.attachments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Archivos actuales:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {formData.attachments.map((url, index) => {
                      const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'archivo').substring(url.indexOf('-') + 1) ;
                      return (
                        <li key={index} className="text-xs flex items-center justify-between">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]" title={fileName}>
                            <Paperclip className="h-3 w-3 inline mr-1" />{fileName}
                          </a>
                          {!isUploading && (
                             <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveAttachment(url)} title="Eliminar adjunto">
                               <X className="h-3 w-3 text-destructive"/>
                             </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${dialogId}-isMonthlyRecurring`} className="text-right">Tarea Recurrente</Label>
            <div className="col-span-3 flex items-center space-x-2">
              <Checkbox
                id={`${dialogId}-isMonthlyRecurring`}
                checked={formData.isMonthlyRecurring || false}
                onCheckedChange={(checked) => handleCheckboxChange('isMonthlyRecurring', Boolean(checked))}
                disabled={isUploading || !!taskToEdit} // Disable if editing, recurrence set on creation
              />
              <label
                htmlFor={`${dialogId}-isMonthlyRecurring`}
                className="text-sm font-normal text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Mensual (se recreará el 1er día del mes siguiente al completarse)
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit} disabled={isUploading}>
            {isUploading ? (
              <>
                <UploadCloud className="mr-2 h-4 w-4 animate-pulse" /> Subiendo...
              </>
            ) : (taskToEdit ? "Guardar Cambios" : "Crear Tarea")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

