
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
import { CURRENT_USER_ID, TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/constants";

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

// Special values for "none" options in Select components
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

  const [formData, setFormData] = useState<Omit<Ticket, 'id' | 'createdAt' | 'reporterUserId'>>(defaultTicket);

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
        setFormData(defaultTicket);
      }
    }
  }, [ticketToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: 'status' | 'priority' | 'assigneeUserId' | 'relatedLeadId', value: string | undefined) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.description) {
      alert("El título y la descripción son obligatorios.");
      return;
    }
    const now = new Date().toISOString();
    const newTicket: Ticket = {
      ...formData,
      id: ticketToEdit ? ticketToEdit.id : `ticket-${Date.now()}`,
      reporterUserId: ticketToEdit ? ticketToEdit.reporterUserId : CURRENT_USER_ID,
      createdAt: ticketToEdit ? ticketToEdit.createdAt : now,
      updatedAt: now,
    };
    onSave(newTicket);
    setIsOpen(false);
  };

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
            <Select
              name="assigneeUserId"
              value={formData.assigneeUserId || NO_USER_SELECTED_VALUE}
              onValueChange={(value) => handleSelectChange('assigneeUserId', value === NO_USER_SELECTED_VALUE ? undefined : value)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona un usuario (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_USER_SELECTED_VALUE}>Sin asignar</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
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
              onValueChange={(value) => handleSelectChange('relatedLeadId', value === NO_LEAD_SELECTED_VALUE ? undefined : value)}
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

