
"use client";

import { useState, useEffect, useId } from "react";
import type { Ticket, Lead, User, TicketStatus, TicketPriority } from "@/lib/types";
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
import { Check, ChevronsUpDown, Paperclip, UploadCloud, X } from "lucide-react";
import { TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/constants";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { storage, db } from "@/lib/firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, collection } from "firebase/firestore";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface AddEditTicketDialogProps {
  trigger: React.ReactNode;
  ticketToEdit?: Ticket | null;
  leads: Lead[];
  users: User[];
  onSave: (ticket: Ticket) => Promise<void>; // Make onSave async
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const defaultTicketBase: Omit<Ticket, 'id' | 'createdAt' | 'reporterUserId' | 'comments'> = {
  title: "",
  description: "",
  status: "Abierto",
  priority: "Media",
  assigneeUserId: undefined,
  relatedLeadId: undefined,
  updatedAt: undefined,
  attachments: [],
};

const NO_LEAD_SELECTED_VALUE = "__no_lead_selected__";
const NO_USER_SELECTED_VALUE = "__no_user_selected__";

export function AddEditTicketDialog({
  trigger,
  ticketToEdit,
  leads,
  users,
  onSave,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: AddEditTicketDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalIsOpen;
  
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const dialogId = useId();

  const [formData, setFormData] = useState<Partial<Omit<Ticket, 'id' | 'createdAt' | 'reporterUserId' | 'comments'>>>(defaultTicketBase);
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentAttachments, setCurrentAttachments] = useState<{ name: string, url: string }[]>([]);


  useEffect(() => {
    if (isOpen) {
      if (ticketToEdit) {
        setFormData({
          title: ticketToEdit.title,
          description: ticketToEdit.description,
          status: ticketToEdit.status,
          priority: ticketToEdit.priority,
          assigneeUserId: ticketToEdit.assigneeUserId || undefined,
          relatedLeadId: ticketToEdit.relatedLeadId || undefined,
          updatedAt: ticketToEdit.updatedAt,
          attachments: ticketToEdit.attachments || [],
        });
        setCurrentAttachments(ticketToEdit.attachments || []);
      } else {
        setFormData({
            ...defaultTicketBase,
            assigneeUserId: currentUser?.id || undefined,
            attachments: [],
        });
        setCurrentAttachments([]);
      }
      setSelectedFile(null);
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [ticketToEdit, isOpen, currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: 'status' | 'priority' | 'assigneeUserId' | 'relatedLeadId', value: string | undefined) => {
    if (name === 'assigneeUserId') {
        setFormData((prev) => ({ ...prev, assigneeUserId: value === NO_USER_SELECTED_VALUE ? undefined : value }));
    } else if (name === 'relatedLeadId') {
        setFormData((prev) => ({ ...prev, relatedLeadId: value === NO_LEAD_SELECTED_VALUE ? undefined : value }));
    }
    else {
        setFormData((prev) => ({ ...prev, [name]: value as TicketStatus | TicketPriority }));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleRemoveAttachment = async (attachmentUrlToRemove: string) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este adjunto? Esta acción no se puede deshacer.")) return;
    
    try {
      const fileStorageRef = storageRef(storage, attachmentUrlToRemove); // Firebase SDK can parse gs:// or https:// URLs
      await deleteObject(fileStorageRef);
      const updatedAttachments = currentAttachments.filter(att => att.url !== attachmentUrlToRemove);
      setCurrentAttachments(updatedAttachments);
      setFormData(prev => ({ ...prev, attachments: updatedAttachments }));
      toast({ title: "Adjunto eliminado", description: "El archivo adjunto ha sido eliminado del almacenamiento." });
    } catch (error: any) {
      console.error("Error eliminando adjunto:", error);
      if (error.code === 'storage/object-not-found') {
        // If file not found in storage, still remove it from local state and form data
        const updatedAttachments = currentAttachments.filter(att => att.url !== attachmentUrlToRemove);
        setCurrentAttachments(updatedAttachments);
        setFormData(prev => ({ ...prev, attachments: updatedAttachments }));
        toast({ title: "Adjunto eliminado localmente", description: "El archivo no se encontró en el almacenamiento, pero se eliminó la referencia." });
      } else {
        toast({ title: "Error al eliminar adjunto", description: error.message, variant: "destructive" });
      }
    }
  };


  const handleSubmit = async () => {
    if (!formData.title || !formData.description) {
      toast({title: "Error de Validación", description: "El título y la descripción son obligatorios.", variant: "destructive"});
      return;
    }
    if (!currentUser?.id && !ticketToEdit) {
        toast({title: "Error de Autenticación", description: "No se pudo identificar al usuario reportador. Intenta recargar la página.", variant: "destructive"});
        return;
    }

    setIsUploading(true); // General loading state for submission

    let finalAttachments = [...currentAttachments];
    const ticketId = ticketToEdit ? ticketToEdit.id : doc(collection(db, "tickets")).id;

    if (selectedFile) {
      setUploadProgress(0);
      const filePath = `ticket-attachments/${currentUser!.id}/${ticketId}/${Date.now()}-${selectedFile.name}`;
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
              reject(error);
            },
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              finalAttachments.push({ name: selectedFile.name, url: downloadURL });
              setSelectedFile(null);
              resolve();
            }
          );
        });
      } catch (error) {
        setIsUploading(false);
        return; 
      }
    }

    const now = new Date().toISOString();
    const ticketDataToSave: Ticket = {
      id: ticketId,
      title: formData.title!,
      description: formData.description!,
      status: formData.status || 'Abierto',
      priority: formData.priority || 'Media',
      createdAt: ticketToEdit ? ticketToEdit.createdAt : now,
      updatedAt: now,
      reporterUserId: ticketToEdit ? ticketToEdit.reporterUserId : (currentUser!.id),
      assigneeUserId: formData.assigneeUserId === NO_USER_SELECTED_VALUE ? undefined : formData.assigneeUserId,
      relatedLeadId: formData.relatedLeadId === NO_LEAD_SELECTED_VALUE ? undefined : formData.relatedLeadId,
      attachments: finalAttachments,
      comments: ticketToEdit ? ticketToEdit.comments : [], // Preserve existing comments on edit
    };
    
    await onSave(ticketDataToSave);
    setIsUploading(false);
    // setIsOpen(false); // Parent component (TicketsPage) will handle closing dialog
  };
  
  let assigneeNameDisplay = "Selecciona un usuario (opcional)";
  if (formData.assigneeUserId) {
    const user = users.find(u => u.id === formData.assigneeUserId);
    if (user) {
      assigneeNameDisplay = user.name;
      if (currentUser && user.id === currentUser.id) {
        assigneeNameDisplay += " (Yo)";
      }
    } else if (formData.assigneeUserId !== NO_USER_SELECTED_VALUE) {
        assigneeNameDisplay = "Usuario no encontrado";
    }
  }

  const sortedUsers = users.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild onClick={() => !isOpen && setIsOpen(true)}>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{ticketToEdit ? "Editar Ticket" : "Abrir Nuevo Ticket"}</DialogTitle>
          <DialogDescription>
            {ticketToEdit ? "Actualiza los detalles de este ticket." : "Completa la información para el nuevo ticket."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${dialogId}-title`} className="text-right">Título</Label>
            <Input id={`${dialogId}-title`} name="title" value={formData.title || ""} onChange={handleChange} className="col-span-3" disabled={isUploading} />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={`${dialogId}-description`} className="text-right pt-2">Descripción</Label>
            <Textarea id={`${dialogId}-description`} name="description" value={formData.description || ""} onChange={handleChange} className="col-span-3" rows={4} disabled={isUploading} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${dialogId}-status`} className="text-right">Estado</Label>
            <Select name="status" value={formData.status || 'Abierto'} onValueChange={(value) => handleSelectChange('status', value as TicketStatus)} disabled={isUploading}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona un estado" />
              </SelectTrigger>
              <SelectContent>
                {TICKET_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={`${dialogId}-priority`} className="text-right">Prioridad</Label>
            <Select name="priority" value={formData.priority || 'Media'} onValueChange={(value) => handleSelectChange('priority', value as TicketPriority)} disabled={isUploading}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona una prioridad" />
              </SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map(priority => (
                  <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                ))}
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
            <Label htmlFor={`${dialogId}-attachments`} className="text-right pt-2">Adjuntos</Label>
            <div className="col-span-3 space-y-2">
              <Input 
                id={`${dialogId}-attachments-input`} 
                name="attachments-input" 
                type="file" 
                onChange={handleFileChange}
                className="mb-2"
                disabled={isUploading && uploadProgress > 0 && uploadProgress < 100}
                accept="image/*,application/pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.zip,.rar" 
              />
              {isUploading && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="w-full h-2" />
                  <p className="text-xs text-muted-foreground text-center">Subiendo archivo... {uploadProgress.toFixed(0)}%</p>
                </div>
              )}
              {selectedFile && !(isUploading && uploadProgress > 0 && uploadProgress < 100) && (
                <p className="text-xs text-muted-foreground">Archivo seleccionado: {selectedFile.name}</p>
              )}
              {currentAttachments && currentAttachments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Archivos actuales:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {currentAttachments.map((att, index) => (
                        <li key={index} className="text-xs flex items-center justify-between">
                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px]" title={att.name}>
                            <Paperclip className="h-3 w-3 inline mr-1" />{att.name}
                          </a>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveAttachment(att.url)} title="Eliminar adjunto" disabled={isUploading}>
                            <X className="h-3 w-3 text-destructive"/>
                          </Button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isUploading}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit} disabled={isUploading}>
            {isUploading ? (
              <>
                <UploadCloud className="mr-2 h-4 w-4 animate-pulse" /> 
                {uploadProgress > 0 && uploadProgress < 100 ? 'Subiendo...' : 'Guardando...'}
              </>
            ) : (ticketToEdit ? "Guardar Cambios" : "Crear Ticket")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
