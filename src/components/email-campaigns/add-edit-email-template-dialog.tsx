
"use client";

import { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { EmailTemplate } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Construction } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "El nombre de la plantilla es obligatorio."),
  subject: z.string().min(1, "El asunto es obligatorio."),
  contentHtml: z.string().min(1, "El contenido HTML es obligatorio."),
  // contentText: z.string().optional(), // For plain text version
  // variables: z.array(z.string()).optional(), // For personalization
});

type EmailTemplateFormValues = z.infer<typeof formSchema>;

interface AddEditEmailTemplateDialogProps {
  trigger: React.ReactNode;
  templateToEdit?: EmailTemplate | null;
  onSave: (data: EmailTemplateFormValues, id?: string) => Promise<boolean>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEditEmailTemplateDialog({
  trigger,
  templateToEdit,
  onSave,
  isOpen,
  onOpenChange,
}: AddEditEmailTemplateDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EmailTemplateFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      subject: "",
      contentHtml: "<h1>Título de ejemplo</h1><p>Contenido del correo...</p>",
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (templateToEdit) {
        form.reset({
          name: templateToEdit.name,
          subject: templateToEdit.subject,
          contentHtml: templateToEdit.contentHtml || "",
        });
      } else {
        form.reset({
          name: "",
          subject: "",
          contentHtml: "<h1>Título de ejemplo</h1><p>Contenido del correo...</p>",
        });
      }
      setIsSubmitting(false);
    }
  }, [templateToEdit, isOpen, form]);

  const onSubmitHandler: SubmitHandler<EmailTemplateFormValues> = async (data) => {
    setIsSubmitting(true);
    const success = await onSave(data, templateToEdit?.id);
    if (success) {
      onOpenChange(false);
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger} {/* DialogTrigger should be passed as child if not using asChild prop on Dialog */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{templateToEdit ? "Editar Plantilla de Correo" : "Nueva Plantilla de Correo"}</DialogTitle>
          <DialogDescription>
            {templateToEdit ? "Actualiza los detalles de esta plantilla." : "Crea una nueva plantilla para tus campañas."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Plantilla</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Bienvenida Nuevos Usuarios" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asunto del Correo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. ¡Bienvenido a Nuestra Comunidad!" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contentHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contenido HTML</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Escribe o pega tu código HTML aquí..." {...field} rows={10} disabled={isSubmitting} />
                  </FormControl>
                  <FormDescription>Puedes usar HTML para diseñar tu correo. El editor visual (Drag & Drop) está en desarrollo.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="p-4 border rounded-md bg-muted/50 text-sm text-muted-foreground">
              <Construction className="inline h-4 w-4 mr-2 text-amber-500" />
              <strong>Funcionalidades en Desarrollo:</strong>
              <ul className="list-disc list-inside ml-4 mt-1 text-xs">
                <li>Editor Visual (Arrastrar y Soltar)</li>
                <li>Biblioteca de plantillas pre-diseñadas</li>
                <li>Personalización con variables (ej. {"{{nombre_contacto}}"})</li>
                <li>Previsualización en escritorio y móvil</li>
              </ul>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Guardando..." : (templateToEdit ? "Guardar Cambios" : "Crear Plantilla")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
