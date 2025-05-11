
"use client";

import { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { EmailCampaign, ContactList, EmailTemplate, EmailCampaignStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2, Send, Construction } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { EMAIL_CAMPAIGN_STATUSES } from "@/lib/constants";

const formSchema = z.object({
  name: z.string().min(1, "El nombre de la campaña es obligatorio."),
  subject: z.string().min(1, "El asunto es obligatorio."),
  fromName: z.string().min(1, "El nombre del remitente es obligatorio."),
  fromEmail: z.string().email("El correo del remitente es inválido."),
  contactListId: z.string().min(1, "Debes seleccionar una lista de contactos."),
  emailTemplateId: z.string().min(1, "Debes seleccionar una plantilla de correo."),
  scheduledAt: z.date().optional(),
});

type EmailCampaignFormValues = z.infer<typeof formSchema>;

interface AddEditEmailCampaignDialogProps {
  trigger: React.ReactNode;
  campaignToEdit?: EmailCampaign | null;
  onSave: (data: Omit<EmailCampaignFormValues, 'scheduledAt'> & { scheduledAt?: string }, id?: string) => Promise<boolean>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contactLists: ContactList[];
  emailTemplates: EmailTemplate[];
}

export function AddEditEmailCampaignDialog({
  trigger,
  campaignToEdit,
  onSave,
  isOpen,
  onOpenChange,
  contactLists,
  emailTemplates,
}: AddEditEmailCampaignDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedScheduledDate, setSelectedScheduledDate] = useState<Date | undefined>(undefined);

  const form = useForm<EmailCampaignFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      subject: "",
      fromName: "",
      fromEmail: "",
      contactListId: "",
      emailTemplateId: "",
      scheduledAt: undefined,
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (campaignToEdit) {
        form.reset({
          name: campaignToEdit.name,
          subject: campaignToEdit.subject,
          fromName: campaignToEdit.fromName,
          fromEmail: campaignToEdit.fromEmail,
          contactListId: campaignToEdit.contactListId,
          emailTemplateId: campaignToEdit.emailTemplateId,
          scheduledAt: campaignToEdit.scheduledAt && isValid(parseISO(campaignToEdit.scheduledAt)) ? parseISO(campaignToEdit.scheduledAt) : undefined,
        });
        setSelectedScheduledDate(campaignToEdit.scheduledAt && isValid(parseISO(campaignToEdit.scheduledAt)) ? parseISO(campaignToEdit.scheduledAt) : undefined);
      } else {
        form.reset({
          name: "", subject: "", fromName: "", fromEmail: "",
          contactListId: "", emailTemplateId: "", scheduledAt: undefined,
        });
        setSelectedScheduledDate(undefined);
      }
      setIsSubmitting(false);
    }
  }, [campaignToEdit, isOpen, form]);

  const handleDateChange = (date: Date | undefined) => {
    setSelectedScheduledDate(date);
    form.setValue("scheduledAt", date);
  };

  const onSubmitHandler: SubmitHandler<EmailCampaignFormValues> = async (data) => {
    setIsSubmitting(true);
    const dataToSave = {
        ...data,
        scheduledAt: data.scheduledAt ? data.scheduledAt.toISOString() : undefined,
    };
    const success = await onSave(dataToSave, campaignToEdit?.id);
    if (success) {
      onOpenChange(false);
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {campaignToEdit ? "Editar Campaña de Email" : "Nueva Campaña de Email"}
          </DialogTitle>
          <DialogDescription>
            {campaignToEdit ? "Actualiza los detalles de esta campaña." : "Configura una nueva campaña para enviar a tus contactos."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Nombre de la Campaña</FormLabel><FormControl><Input placeholder="Ej. Promoción Verano 2024" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="subject" render={({ field }) => (
              <FormItem><FormLabel>Asunto del Correo</FormLabel><FormControl><Input placeholder="Ej. ¡Descuentos Exclusivos de Verano!" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="fromName" render={({ field }) => (
                    <FormItem><FormLabel>Nombre Remitente</FormLabel><FormControl><Input placeholder="Ej. Tu Empresa" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="fromEmail" render={({ field }) => (
                    <FormItem><FormLabel>Email Remitente</FormLabel><FormControl><Input type="email" placeholder="ej. marketing@tuempresa.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
            </div>
             <FormField control={form.control} name="contactListId" render={({ field }) => (
                <FormItem>
                    <FormLabel>Lista de Contactos</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecciona una lista" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {contactLists.map(list => <SelectItem key={list.id} value={list.id}>{list.name} ({list.contactCount || 0} contactos)</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
             <FormField control={form.control} name="emailTemplateId" render={({ field }) => (
                <FormItem>
                    <FormLabel>Plantilla de Correo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecciona una plantilla" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {emailTemplates.map(template => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
             <FormField control={form.control} name="scheduledAt" render={({ field }) => (
                <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Envío Programado (Opcional)</FormLabel>
                    <Popover>
                        <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                                variant={"outline"}
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                            {selectedScheduledDate ? format(selectedScheduledDate, "PPP p", { locale: es }) : <span>Seleccionar fecha y hora</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            locale={es}
                            mode="single"
                            selected={selectedScheduledDate}
                            onSelect={handleDateChange}
                            disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} // Disable past dates
                            initialFocus
                        />
                        {/* Time picker could be added here */}
                        </PopoverContent>
                    </Popover>
                    <FormDescription>Si no se selecciona, la campaña quedará como borrador.</FormDescription>
                    <FormMessage />
                </FormItem>
            )} />
            
            <div className="p-4 border rounded-md bg-muted/50 text-sm text-muted-foreground">
              <Construction className="inline h-4 w-4 mr-2 text-amber-500" />
              <strong>Funcionalidades Avanzadas (En Desarrollo):</strong>
              <ul className="list-disc list-inside ml-4 mt-1 text-xs">
                <li>Envío Inmediato vs Programado (Mejorado con hora)</li>
                <li>Analíticas de Rendimiento (Aperturas, Clics)</li>
                <li>Pruebas A/B para Asuntos y Contenido</li>
              </ul>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !contactLists.length || !emailTemplates.length}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Guardando..." : (campaignToEdit ? "Guardar Cambios" : "Crear Campaña")}
              </Button>
            </DialogFooter>
             {(!contactLists.length || !emailTemplates.length) && (
                <p className="text-xs text-destructive text-center mt-2">
                    Necesitas crear al menos una lista de contactos y una plantilla para poder crear una campaña.
                </p>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
