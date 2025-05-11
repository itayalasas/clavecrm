"use client";

import { useState, useEffect } from "react";
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
import { Check, ChevronsUpDown } from "lucide-react";
import { TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/constants";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

interface AddEditTicketDialogProps {
  trigger: React.ReactNode;
  ticketToEdit?: Ticket | null;
  leads: Lead[];
  users: User[];
  onSave: (ticket: Ticket) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const defaultTicket: Omit<Ticket, 'id' | 'createdAt' | 'reporterUserId'> = {
  title: "",
  description: "",
  status: "Abierto",
  priority: "Media",
  assigneeUserId: undefined,
  relatedLeadId: undefined,
  updatedAt: undefined,
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

  const [formData, setFormData] = useState<Omit<Ticket, 'id' | 'createdAt' | 'reporterUserId'>>({
    ...defaultTicket,
    assigneeUserId: currentUser?.id || undefined, 
  });
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);


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
        });
      } else {
        setFormData({
            ...defaultTicket,
            assigneeUserId: currentUser?.id || undefined,
        });
      }
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

  const handleSubmit = () => {
    if (!formData.title || !formData.description) {
      alert("El título y la descripción son obligatorios.");
      return;
    }
    if (!currentUser?.id && !ticketToEdit) {
        alert("No se pudo identificar al usuario reportador. Intenta recargar la página.");
        return;
    }

    const now = new Date().toISOString();
    const newTicketData: Omit<Ticket, 'id' | 'createdAt' | 'reporterUserId'> = {
      ...formData,
       assigneeUserId: formData.assigneeUserId === NO_USER_SELECTED_VALUE ? undefined : formData.assigneeUserId,
    };
    
    const finalTicket: Ticket = {
      ...newTicketData,
      id: ticketToEdit ? ticketToEdit.id : `ticket-${Date.now()}`,
      reporterUserId: ticketToEdit ? ticketToEdit.reporterUserId : (currentUser?.id || ""),
      createdAt: ticketToEdit ? ticketToEdit.createdAt : now,
      updatedAt: now,
    };
    onSave(finalTicket);
    setIsOpen(false);
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
            <Label htmlFor="title" className="text-right">Título</Label>
            <Input id="title" name="title" value={formData.title} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right pt-2">Descripción</Label>
            <Textarea id="description" name="description" value={formData.description} onChange={handleChange} className="col-span-3" rows={4} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Estado</Label>
            <Select name="status" value={formData.status} onValueChange={(value) => handleSelectChange('status', value as TicketStatus)}>
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
            <Label htmlFor="priority" className="text-right">Prioridad</Label>
            <Select name="priority" value={formData.priority} onValueChange={(value) => handleSelectChange('priority', value as TicketPriority)}>
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
            <Label htmlFor="assigneeUserId" className="text-right">Asignar a</Label>
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
                  <CommandInput placeholder="Buscar usuario..." />
                   <CommandList>
                    <CommandEmpty>No se encontró usuario.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
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
                          value={user.id}
                          onSelect={() => {
                            handleSelectChange('assigneeUserId', user.id);
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
          <Button type="submit" onClick={handleSubmit}>Guardar Ticket</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}