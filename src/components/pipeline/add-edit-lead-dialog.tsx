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

interface AddEditLeadDialogProps {
  trigger: React.ReactNode;
  stages: PipelineStage[];
  leadToEdit?: Lead | null;
  onSave: (lead: Lead) => void;
}

const defaultLead: Omit<Lead, 'id' | 'createdAt'> = {
  name: "",
  email: "",
  phone: "",
  company: "",
  stageId: "",
  details: "",
  value: 0,
};

export function AddEditLeadDialog({ trigger, stages, leadToEdit, onSave }: AddEditLeadDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Omit<Lead, 'id' | 'createdAt'>>(defaultLead);

  useEffect(() => {
    if (leadToEdit) {
      setFormData({
        name: leadToEdit.name,
        email: leadToEdit.email || "",
        phone: leadToEdit.phone || "",
        company: leadToEdit.company || "",
        stageId: leadToEdit.stageId,
        details: leadToEdit.details || "",
        value: leadToEdit.value || 0,
      });
    } else {
      setFormData(prev => ({...defaultLead, stageId: stages[0]?.id || ""}));
    }
  }, [leadToEdit, isOpen, stages]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === 'value' ? parseFloat(value) : value }));
  };

  const handleStageChange = (value: string) => {
    setFormData((prev) => ({ ...prev, stageId: value }));
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
      <DialogContent className="sm:max-w-[480px]">
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
              Correo Electrónico
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
