
"use client";

import { useState, type ChangeEvent } from "react";
import type { User, Lead, Contact, Order, Quote, Ticket } from "@/lib/types"; // Assuming other types might be needed for association
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .doc, .docx
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xls, .xlsx
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .ppt, .pptx
  "text/plain", "text/csv"
];

const formSchema = z.object({
  file: z.custom<File>((val) => val instanceof File, "Se requiere un archivo.")
    .refine((file) => file.size <= MAX_FILE_SIZE, `El tamaño máximo del archivo es ${MAX_FILE_SIZE / (1024*1024)}MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), "Tipo de archivo no permitido."),
  description: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tags
  // Add fields for association later if needed (e.g., relatedLeadId)
});

type DocumentUploadFormValues = z.infer<typeof formSchema>;

interface DocumentUploadFormProps {
  currentUser: User | null;
  onUploadSuccess: () => void; // Callback to refresh document list
  // Pass lists of other entities if direct association in form is needed
  leads?: Lead[];
  contacts?: Contact[];
  // ... other entities
}

export function DocumentUploadForm({ currentUser, onUploadSuccess, leads, contacts }: DocumentUploadFormProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const form = useForm<DocumentUploadFormValues>({
    resolver: zodResolver(formSchema),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue("file", file);
      form.clearErrors("file");
    }
  };

  const onSubmit: SubmitHandler<DocumentUploadFormValues> = async (data) => {
    if (!currentUser) {
      toast({ title: "Error de autenticación", description: "Debes iniciar sesión para subir documentos.", variant: "destructive" });
      return;
    }
    if (!data.file) {
        toast({ title: "Archivo no seleccionado", description: "Por favor, selecciona un archivo para subir.", variant: "destructive" });
        return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload to Firebase Storage and saving metadata to Firestore
    // In a real app, this would involve calls to Firebase SDK
    // For now, we'll simulate it with a delay
    
    const fileName = data.file.name;
    const fileType = data.file.type;
    const fileSize = data.file.size;
    const description = data.description;
    const tagsArray = data.tags?.split(',').map(tag => tag.trim()).filter(tag => tag) || [];

    // Simulate upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) clearInterval(interval);
    }, 200);

    await new Promise(resolve => setTimeout(resolve, 2500)); // Simulate upload time

    try {
      // This is where you would use Firebase SDK:
      // 1. Upload to Firebase Storage:
      //    const storageRef = ref(storage, `documents/${currentUser.id}/${Date.now()}-${fileName}`);
      //    const uploadTask = uploadBytesResumable(storageRef, data.file);
      //    ... (handle progress, get downloadURL)
      // 2. Save metadata to Firestore:
      //    const docData = { name: fileName, fileURL, fileType, fileSize, description, tagsArray, uploadedAt: serverTimestamp(), uploadedByUserId: currentUser.id, uploadedByUserName: currentUser.name, ...associations };
      //    await addDoc(collection(db, "documents"), docData);

      toast({
        title: "Documento Subido (Simulado)",
        description: `El archivo "${fileName}" ha sido subido exitosamente.`,
      });
      onUploadSuccess();
      form.reset({ description: "", tags: "" }); 
      const fileInput = document.getElementById('document-file-input') as HTMLInputElement | null;
      if (fileInput) fileInput.value = ""; // Reset file input
      
    } catch (error) {
      console.error("Error subiendo documento (simulado):", error);
      toast({ title: "Error al Subir Documento", description: "Ocurrió un error.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      clearInterval(interval); // Ensure interval is cleared
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="h-6 w-6 text-primary" />
          Subir Nuevo Documento
        </CardTitle>
        <CardDescription>
          Carga archivos para almacenarlos y gestionarlos de forma segura en el CRM.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="file"
              render={({ fieldState }) => ( // field is not directly used, manage file via native input
                <FormItem>
                  <FormLabel htmlFor="document-file-input">Archivo</FormLabel>
                  <FormControl>
                    <Input 
                      id="document-file-input"
                      type="file" 
                      onChange={handleFileChange} 
                      disabled={isUploading}
                      accept={ALLOWED_FILE_TYPES.join(",")}
                    />
                  </FormControl>
                  {fieldState.error && <FormMessage>{fieldState.error.message}</FormMessage>}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Breve descripción del documento..." {...field} disabled={isUploading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etiquetas (Opcional, separadas por comas)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. contrato, propuesta, importante" {...field} disabled={isUploading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isUploading && (
              <div className="space-y-1">
                <Progress value={uploadProgress} className="w-full h-2" />
                <p className="text-xs text-muted-foreground text-center">Subiendo... {uploadProgress.toFixed(0)}%</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isUploading || !currentUser}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {isUploading ? "Subiendo..." : "Subir Documento"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
