"use client";

import { useState, useEffect } from "react";
import type { Lead, PipelineStage } from "@/lib/types";
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
import { format, parseISO, isValid } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";

interface AddEditLeadDialogProps {
  trigger: React.ReactNode;
  stages: PipelineStage[];
  leadToEdit?: Lead | null;
  onSave: (lead: Lead) => void;
}

const defaultLeadBase: Omit<Lead, 'id' | 'createdAt'> = {
  name: "",
  email: "",
  phone: "",
  company: "",
  stageId: "",
  details: "",
  value: 0,
  score: 0,
  probability: 0,
  expectedCloseDate: undefined,
};

export function AddEditLeadDialog({ trigger, stages, leadToEdit, onSave }: AddEditLeadDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Omit<Lead, 'id' | 'createdAt'>>(defaultLeadBase);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      if (leadToEdit) {
        const initialData = {
          name: leadToEdit.name,
          email: leadToEdit.email || "",
          phone: leadToEdit.phone || "",
          company: leadToEdit.company || "",
          stageId: leadToEdit.stageId,
          details: leadToEdit.details || "",
          value: leadToEdit.value || 0,
          score: leadToEdit.score || 0,
          probability: leadToEdit.probability || 0,
          expectedCloseDate: leadToEdit.expectedCloseDate,
        };
        setFormData(initialData);
        setSelectedDate(leadToEdit.expectedCloseDate && isValid(parseISO(leadToEdit.expectedCloseDate)) ? parseISO(leadToEdit.expectedCloseDate) : undefined);
      } else {
        setFormData(prev => ({...defaultLeadBase, stageId: stages[0]?.id || ""}));
        setSelectedDate(undefined);
      }
    }
  }, [leadToEdit, isOpen, stages]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ 
      ...prev, 
      [name]: (name === 'value' || name === 'score' || name === 'probability') ? parseFloat(value) || 0 : value 
    }));
  };

  const handleStageChange = (value: string) => {
    setFormData((prev) => ({ ...prev, stageId: value }));
  };

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setFormData((prev) => ({ ...prev, expectedCloseDate: date ? date.toISOString() : undefined }));
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.stageId) {
      alert("El nombre y la etapa son obligatorios.");
      return;
    }
    const newLead: Lead = {
      ...formData,
      id: leadToEdit ? leadToEdit.id : `lead-${Date.now()}`, 
      createdAt: leadToEdit ? leadToEdit.createdAt : new Date().toISOString(),
    };
    onSave(newLead);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{leadToEdit ? "Editar Lead" : "Añadir Nuevo Lead"}</DialogTitle>
          <DialogDescription>
            {leadToEdit ? "Actualiza los detalles de este lead." : "Completa la información para el nuevo lead."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Nombre
            </Label>
            <Input id="name" name="name" value={formData.name} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Correo
            </Label>
            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right">
              Teléfono
            </Label>
            <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="company" className="text-right">
              Empresa
            </Label>
            <Input id="company" name="company" value={formData.company} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="value" className="text-right">
              Valor ($)
            </Label>
            <Input id="value" name="value" type="number" value={formData.value} onChange={handleChange} className="col-span-3" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="score" className="text-right">
              Puntuación
            </Label>
            <Input id="score" name="score" type="number" min="0" max="100" value={formData.score} onChange={handleChange} className="col-span-3" placeholder="0-100" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="probability" className="text-right">
              Probabilidad (%)
            </Label>
            <Input id="probability" name="probability" type="number" min="0" max="100" value={formData.probability} onChange={handleChange} className="col-span-3" placeholder="0-100" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="expectedCloseDate" className="text-right">Fecha Cierre</Label>
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
            <Label htmlFor="stageId" className="text-right">
              Etapa
            </Label>
            <Select name="stageId" value={formData.stageId} onValueChange={handleStageChange}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona una etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="details" className="text-right pt-2">
              Detalles
            </Label>
            <Textarea id="details" name="details" value={formData.details} onChange={handleChange} className="col-span-3" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit}>Guardar Lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}