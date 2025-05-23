
"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Send, Paperclip, Archive, Loader2, Trash2, MoreVertical, XCircle, UserPlus, X as XIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Lead, Contact } from "@/lib/types";
import { ScrollArea } from "../ui/scroll-area";

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
  initialAttachments?: { name: string; url: string; size?: number; type?: string }[];
  onQueueEmail: (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, attachments: File[]) => Promise<boolean>;
  onSaveDraft: (data: { to: string; cc?: string; bcc?: string; subject: string; body: string; }, attachments: File[]) => Promise<boolean>;
  isSending?: boolean;
  isSavingDraft?: boolean;
  onClose?: () => void;
  leads?: Lead[];
  contacts?: Contact[];
}

export function EmailComposer({
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  initialAttachments = [],
  onQueueEmail,
  onSaveDraft,
  isSending = false,
  isSavingDraft = false,
  onClose,
  leads = [],
  contacts = [],
}: EmailComposerProps) {
  const { toast } = useToast();
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attachmentSearchTerm, setAttachmentSearchTerm] = useState(""); // For contact/lead search
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    form.reset({
      to: initialTo,
      cc: "",
      bcc: "",
      subject: initialSubject,
      body: initialBody,
    });
    setShowCc(false);
    setShowBcc(false);
    setSelectedFiles([]); // Clear selected files when initial values change
    // TODO: If initialAttachments are provided (e.g. loading a draft), set them up
  }, [initialTo, initialSubject, initialBody, initialAttachments, form]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files as FileList)]);
    }
     if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset file input to allow selecting the same file again
    }
  };

  const removeSelectedFile = (fileName: string) => {
    setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
  };

  const onSubmit: SubmitHandler<EmailComposerFormValues> = async (data) => {
    const success = await onQueueEmail(data, selectedFiles);
    if (success) {
        // Parent component (EmailPageContent) handles closing
    }
  };

  const handleDraftSave: SubmitHandler<EmailComposerFormValues> = async (data) => {
    const success = await onSaveDraft(data, selectedFiles);
    if (success) {
        // Parent component (EmailPageContent) handles closing
    }
  };
  
  const addRecipient = (email: string) => {
    const currentTo = form.getValues("to");
    form.setValue("to", currentTo ? `${currentTo}, ${email}` : email);
    setAttachmentSearchTerm(""); // Clear search
  };

  const filteredRecipients = React.useMemo(() => {
    if (!attachmentSearchTerm.trim()) return [];
    const lowerSearch = attachmentSearchTerm.toLowerCase();
    const foundLeads = leads
        .filter(l => l.email && (l.name.toLowerCase().includes(lowerSearch) || l.email.toLowerCase().includes(lowerSearch)))
        .map(l => ({ id: l.id, name: l.name, email: l.email!, type: 'Lead' }));
    const foundContacts = contacts
        .filter(c => ( (c.firstName || "") + " " + (c.lastName || "") ).toLowerCase().includes(lowerSearch) || c.email.toLowerCase().includes(lowerSearch) )
        .map(c => ({ id: c.id, name: `${c.firstName || ""} ${c.lastName || ""}`.trim(), email: c.email, type: 'Contacto' }));
    return [...foundLeads, ...foundContacts].slice(0, 5); // Limit to 5 suggestions
  }, [attachmentSearchTerm, leads, contacts]);


  return (
    <Card className="shadow-md flex flex-col h-full">
      <Form {...form}>
        <form className="flex flex-col h-full">
          <CardContent className="p-4 space-y-3 flex-grow flex flex-col">
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                    <div className="flex items-center">
                      <FormLabel className="w-20 pr-2 text-right text-sm text-muted-foreground shrink-0">Para</FormLabel>
                      <FormControl>
                        <Input placeholder="destinatario@ejemplo.com" {...field} className="text-sm" />
                      </FormControl>
                    </div>
                    <FormMessage className="pl-20" />
                  </FormItem>
                )}
              />
              <div className="text-sm">
                <Button type="button" variant="link" onClick={() => setShowCc(!showCc)} className="p-0 h-auto text-muted-foreground hover:text-primary">CC</Button>
                <span className="mx-1 text-muted-foreground">/</span>
                <Button type="button" variant="link" onClick={() => setShowBcc(!showBcc)} className="p-0 h-auto text-muted-foreground hover:text-primary">CCO</Button>
              </div>
            </div>
            
            {/* Placeholder for Contact/Lead search for "To" field */}
            <div className="pl-20"> {/* Aligns with the "To" input */}
              <Input 
                type="search"
                placeholder="Buscar Contacto o Lead para añadir a 'Para'..."
                value={attachmentSearchTerm}
                onChange={(e) => setAttachmentSearchTerm(e.target.value)}
                className="text-xs h-8"
              />
              {filteredRecipients.length > 0 && (
                <ScrollArea className="h-auto max-h-32 border rounded-md mt-1">
                  <div className="p-1">
                    {filteredRecipients.map(r => (
                      <Button 
                        key={`${r.type}-${r.id}`} 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start text-xs h-auto py-1"
                        onClick={() => addRecipient(r.email)}
                      >
                        {r.name} ({r.email}) - <span className="ml-1 text-muted-foreground text-[10px]">{r.type}</span>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>


            {showCc && (
              <FormField
                control={form.control}
                name="cc"
                render={({ field }) => (
                  <FormItem className="flex-grow">
                     <div className="flex items-center">
                      <FormLabel className="w-20 pr-2 text-right text-sm text-muted-foreground shrink-0">CC</FormLabel>
                      <FormControl>
                        <Input placeholder="cc@ejemplo.com (separados por coma)" {...field} className="text-sm" />
                      </FormControl>
                    </div>
                    <FormMessage className="pl-20" />
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
                      <FormLabel className="w-20 pr-2 text-right text-sm text-muted-foreground shrink-0">CCO</FormLabel>
                      <FormControl>
                        <Input placeholder="cco@ejemplo.com (separados por coma)" {...field} className="text-sm" />
                      </FormControl>
                    </div>
                    <FormMessage className="pl-20" />
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
                      placeholder="Escribe tu mensaje aquí..."
                      {...field}
                      className="flex-grow resize-none border-0 shadow-none p-2 focus-visible:ring-0 text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             {selectedFiles.length > 0 && (
              <div className="pt-2 border-t">
                <Label className="text-xs font-medium">Archivos Adjuntos:</Label>
                <ScrollArea className="h-auto max-h-20 mt-1">
                  <ul className="space-y-1">
                    {selectedFiles.map(file => (
                      <li key={file.name} className="flex justify-between items-center text-xs bg-muted/50 p-1 rounded-sm">
                        <span className="truncate" title={file.name}>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeSelectedFile(file.name)}>
                          <XIcon className="h-3 w-3 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </CardContent>
          <CardFooter className="p-3 border-t flex justify-between items-center shrink-0">
            <div className="flex gap-1">
              <Button type="button" onClick={form.handleSubmit(onSubmit)} disabled={isSending || isSavingDraft}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
              <Button type="button" variant="outline" onClick={form.handleSubmit(handleDraftSave)} disabled={isSending || isSavingDraft}>
                {isSavingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                Guardar Borrador
              </Button>
              {onClose && (
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSending || isSavingDraft}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Cerrar
                </Button>
              )}
            </div>
            <div className="flex gap-1">
             <Button type="button" variant="ghost" size="icon" title="Adjuntar archivo" onClick={() => fileInputRef.current?.click()} disabled={isSending || isSavingDraft}>
                <Paperclip className="h-5 w-5" />
              </Button>
              <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"/>
              <Button type="button" variant="ghost" size="icon" disabled title="Descartar borrador (Próximamente)">
                <Trash2 className="h-5 w-5 text-destructive" />
              </Button>
               <Button type="button" variant="ghost" size="icon" disabled title="Opciones de envío (Próximamente)">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
