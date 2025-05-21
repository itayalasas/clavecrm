
"use client";

import { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { EmailCampaign, ContactList, EmailTemplate } from "@/lib/types";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionUI } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2, Send, Construction, BarChart2, TestTube2, Clock } from "lucide-react";
import { format, parseISO, isValid, setHours, setMinutes, setSeconds, setMilliseconds, isBefore, startOfMinute } from "date-fns";
import { es } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { Timestamp } from "firebase/firestore";


const formSchema = z.object({
  name: z.string().min(1, "El nombre de la campaña es obligatorio."),
  subject: z.string().min(1, "El asunto es obligatorio."),
  fromName: z.string().min(1, "El nombre del remitente es obligatorio."),
  fromEmail: z.string().email("El correo del remitente es inválido."),
  contactListId: z.string().min(1, "Debes seleccionar una lista de contactos."),
  emailTemplateId: z.string().min(1, "Debes seleccionar una plantilla de correo."),
  scheduledDate: z.date().optional(),
  scheduledHour: z.string().optional().refine(val => !val || (parseInt(val) >= 0 && parseInt(val) <= 23), { message: "Hora inválida (0-23)"}),
  scheduledMinute: z.string().optional().refine(val => !val || (parseInt(val) >= 0 && parseInt(val) <= 59), { message: "Minuto inválido (0-59)"}),
});

type EmailCampaignFormValues = z.infer<typeof formSchema>;

interface AddEditEmailCampaignDialogProps {
  trigger: React.ReactNode;
  campaignToEdit?: EmailCampaign | null;
  onSave: (data: Omit<EmailCampaignFormValues, 'scheduledDate' | 'scheduledHour' | 'scheduledMinute'> & { scheduledAt?: string }, id?: string) => Promise<boolean>;
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
  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC';

  const form = useForm<EmailCampaignFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      subject: "",
      fromName: "",
      fromEmail: "",
      contactListId: "",
      emailTemplateId: "",
      scheduledDate: undefined,
      scheduledHour: "09",
      scheduledMinute: "00",
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (campaignToEdit && campaignToEdit.scheduledAt) {
        const scheduledAtUTC = parseISO(campaignToEdit.scheduledAt);
        if (isValid(scheduledAtUTC)) {
          const scheduledAtLocal = utcToZonedTime(scheduledAtUTC, userTimeZone);
          form.reset({
            name: campaignToEdit.name,
            subject: campaignToEdit.subject,
            fromName: campaignToEdit.fromName,
            fromEmail: campaignToEdit.fromEmail,
            contactListId: campaignToEdit.contactListId,
            emailTemplateId: campaignToEdit.emailTemplateId,
            scheduledDate: scheduledAtLocal,
            scheduledHour: format(scheduledAtLocal, "HH"),
            scheduledMinute: format(scheduledAtLocal, "mm"),
          });
        } else {
          // Handle invalid date string in campaignToEdit.scheduledAt
           form.reset({
            ...campaignToEdit,
            scheduledDate: undefined,
            scheduledHour: "09",
            scheduledMinute: "00",
          });
        }
      } else if (campaignToEdit) {
         form.reset({
            ...campaignToEdit,
            scheduledDate: undefined,
            scheduledHour: "09",
            scheduledMinute: "00",
          });
      }
      else {
        form.reset({
          name: "", subject: "", fromName: "", fromEmail: "",
          contactListId: "", emailTemplateId: "", scheduledDate: undefined,
          scheduledHour: "09", scheduledMinute: "00",
        });
      }
      setIsSubmitting(false);
    }
  }, [campaignToEdit, isOpen, form, userTimeZone]);


  const onSubmitHandler: SubmitHandler<EmailCampaignFormValues> = async (data) => {
    setIsSubmitting(true);
    let scheduledAtISO: string | undefined = undefined;

    if (data.scheduledDate) {
        let localScheduledDateTime = data.scheduledDate;
        const hour = parseInt(data.scheduledHour || "0");
        const minute = parseInt(data.scheduledMinute || "0");
        
        localScheduledDateTime = setHours(localScheduledDateTime, hour);
        localScheduledDateTime = setMinutes(localScheduledDateTime, minute);
        localScheduledDateTime = setSeconds(localScheduledDateTime, 0);
        localScheduledDateTime = setMilliseconds(localScheduledDateTime, 0);
        
        // Convert the user's local selected date/time to UTC for storage
        const utcDate = zonedTimeToUtc(localScheduledDateTime, userTimeZone);
        scheduledAtISO = utcDate.toISOString();
    }

    const dataToSave = {
        name: data.name,
        subject: data.subject,
        fromName: data.fromName,
        fromEmail: data.fromEmail,
        contactListId: data.contactListId,
        emailTemplateId: data.emailTemplateId,
        scheduledAt: scheduledAtISO,
    };
    const success = await onSave(dataToSave, campaignToEdit?.id);
    if (success) {
      onOpenChange(false);
    }
    setIsSubmitting(false);
  };

  const selectedScheduledDate = form.watch("scheduledDate");

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
            {campaignToEdit ? "Actualiza los detalles de esta campaña." : "Configura una nueva campaña para enviar a tus contactos. Define el contenido, la lista de destinatarios y la programación."}
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
             <FormField control={form.control} name="scheduledDate" render={({ field }) => (
                <FormItem className="flex flex-col">
                    <FormLabel>Fecha de Envío Programado (Opcional)</FormLabel>
                    <Popover>
                        <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                                variant={"outline"}
                                className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                            {selectedScheduledDate ? format(selectedScheduledDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            locale={es}
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                                field.onChange(date);
                                // Si se deselecciona la fecha, limpiar hora y minuto también
                                if (!date) {
                                    form.setValue("scheduledHour", "09");
                                    form.setValue("scheduledMinute", "00");
                                }
                            }}
                            disabled={(date) => isBefore(date, startOfMinute(new Date())) && !isEqual(startOfMinute(date), startOfMinute(new Date()))} // Disable past dates/times more accurately
                            initialFocus
                        />
                        </PopoverContent>
                    </Popover>
                    <FormDescriptionUI>Si no se selecciona, la campaña quedará como borrador. Para envío inmediato, programa para la hora actual o muy próxima. La hora se interpreta en tu zona horaria local.</FormDescriptionUI>
                    <FormMessage />
                </FormItem>
            )} />
            {selectedScheduledDate && (
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="scheduledHour" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Hora (0-23)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "09"}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="scheduledMinute" render={({ field }) => (
                         <FormItem>
                            <FormLabel>Minuto (0-59)</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value || "00"}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
            )}

            <div className="p-4 border rounded-md bg-muted/50 text-sm text-muted-foreground">
              <Clock className="inline h-4 w-4 mr-2 text-blue-500" />
              <strong>Programación y Envío:</strong>
              <ul className="list-disc list-inside ml-4 mt-1 text-xs space-y-1">
                <li>Las campañas programadas son procesadas por una Cloud Function.</li>
                <li>El estado cambiará a &quot;Enviando&quot; cuando la Cloud Function comience el proceso.</li>
                <li>Las analíticas básicas (enviados/destinatarios) se actualizan tras el envío por la Cloud Function.</li>
                 <li><BarChart2 className="inline h-3 w-3 mr-1 text-purple-500" />Analíticas Detalladas (aperturas, clics): <span className="font-semibold text-amber-600">Próximamente</span> (requiere webhooks).</li>
                <li><TestTube2 className="inline h-3 w-3 mr-1 text-teal-500" />Pruebas A/B: <span className="font-semibold text-amber-600">Próximamente</span>.</li>
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
