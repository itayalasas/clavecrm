
"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Send, Paperclip, CalendarClock, Loader2, Trash2, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const emailComposerSchema = z.object({
  to: z.string().email("Dirección de correo 'Para' inválida."),
  cc: z.string().optional().refine(val => !val || val.split(',').every(email => z.string().email().safeParse(email.trim()).success), {
    message: "Una o más direcciones en CC son inválidas."
  }),
  bcc: z.string().optional().refine(val => !val || val.split(',').every(email => z.string().email().safeParse(email.trim()).success), {
    message: "Una o más direcciones en CCO son inválidas."
  }),
  subject: z.string().min(1, "El asunto es obligatorio."),
  body: z.string().min(1, "El cuerpo del correo es obligatorio."),
});

type EmailComposerFormValues = z.infer<typeof emailComposerSchema>;

interface EmailComposerProps {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  onSend: (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }) => Promise<void>;
  isSending?: boolean; // To be controlled by parent if real sending implemented
}

export function EmailComposer({
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  onSend,
  isSending = false, // Default to false
}: EmailComposerProps) {
  const { toast } = useToast();
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const form = useForm<EmailComposerFormValues>({
    resolver: zodResolver(emailComposerSchema),
    defaultValues: {
      to: initialTo,
      cc: "",
      bcc: "",
      subject: initialSubject,
      body: initialBody,
    },
  });

  const onSubmit: SubmitHandler<EmailComposerFormValues> = async (data) => {
    await onSend(data);
    // form.reset(); // Optionally reset form after send, parent might handle this
  };

  return (
    <Card className="shadow-md flex flex-col h-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
          <CardContent className="p-4 space-y-3 flex-grow flex flex-col">
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <div className="flex items-center">
                      <FormLabel className="w-12 pr-2 text-right text-sm text-muted-foreground">Para</FormLabel>
                      <FormControl>
                        <Input placeholder="destinatario@ejemplo.com" {...field} className="text-sm" />
                      </FormControl>
                    </div>
                    <FormMessage className="pl-14" />
                  </FormItem>
                )}
              />
              <div className="text-sm">
                <Button type="button" variant="link" onClick={() => setShowCc(!showCc)} className="p-0 h-auto text-muted-foreground hover:text-primary">CC</Button>
                <span className="mx-1 text-muted-foreground">/</span>
                <Button type="button" variant="link" onClick={() => setShowBcc(!showBcc)} className="p-0 h-auto text-muted-foreground hover:text-primary">CCO</Button>
              </div>
            </div>

            {showCc && (
              <FormField
                control={form.control}
                name="cc"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                     <div className="flex items-center">
                      <FormLabel className="w-12 pr-2 text-right text-sm text-muted-foreground">CC</FormLabel>
                      <FormControl>
                        <Input placeholder="cc@ejemplo.com (separados por coma)" {...field} className="text-sm" />
                      </FormControl>
                    </div>
                    <FormMessage className="pl-14" />
                  </FormItem>
                )}
              />
            )}
            {showBcc && (
              <FormField
                control={form.control}
                name="bcc"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                     <div className="flex items-center">
                      <FormLabel className="w-12 pr-2 text-right text-sm text-muted-foreground">CCO</FormLabel>
                      <FormControl>
                        <Input placeholder="cco@ejemplo.com (separados por coma)" {...field} className="text-sm" />
                      </FormControl>
                    </div>
                    <FormMessage className="pl-14" />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder="Agregar un asunto" {...field} className="border-0 border-b rounded-none shadow-none px-0 focus-visible:ring-0 text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem className="flex-grow flex flex-col">
                  <FormControl className="flex-grow">
                    <Textarea
                      placeholder="Escriba / para insertar archivos y más"
                      {...field}
                      className="flex-grow resize-none border-0 shadow-none p-2 focus-visible:ring-0 text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="p-3 border-t flex justify-between items-center shrink-0">
            <div className="flex gap-1">
              <Button type="submit" disabled={isSending}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
              {/* Placeholder for advanced options */}
              <Button type="button" variant="ghost" size="icon" disabled title="Opciones de envío (Próximamente)">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" disabled title="Adjuntar archivo (Próximamente)">
                <Paperclip className="h-5 w-5" />
              </Button>
               <Button type="button" variant="ghost" size="icon" disabled title="Guardar borrador (Próximamente)">
                <Archive className="h-5 w-5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" disabled title="Descartar borrador">
                <Trash2 className="h-5 w-5 text-destructive" />
              </Button>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
