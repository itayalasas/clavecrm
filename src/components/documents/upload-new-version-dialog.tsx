"use client";

import { useState, type ChangeEvent } from "react";
import type { User, DocumentFile, DocumentVersion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionUI } from "@/components/ui/form";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, arrayUnion, Timestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Progress } from "@/components/ui/progress";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv"
];

const formSchema = z.object({
  file: z.custom<File>((val) => val instanceof File, "Se requiere un archivo.")
    .refine((file) => file.size <= MAX_FILE_SIZE, `El tamaño máximo del archivo es ${MAX_FILE_SIZE / (1024*1024)}MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), "Tipo de archivo no permitido."),
  versionNotes: z.string().optional(),
});

type UploadNewVersionFormValues = z.infer<typeof formSchema>;

interface UploadNewVersionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentToUpdate: DocumentFile;
  currentUser: User;
  onUploadSuccess: () => void;
}

export function UploadNewVersionDialog({
  isOpen,
  onOpenChange,
  documentToUpdate,
  currentUser,
  onUploadSuccess,
}: UploadNewVersionDialogProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const form = useForm<UploadNewVersionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      versionNotes: "",
    }
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      form.setValue("file", file);
      form.clearErrors("file");
    }
  };

  const onSubmit: SubmitHandler<UploadNewVersionFormValues> = async (data) => {
    if (!data.file) {
      toast({ title: "Archivo no seleccionado", description: "Por favor, selecciona un archivo para subir.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const fileToUpload = data.file;
    const newFileNameInStorage = `${Date.now()}-${currentUser.id}-${fileToUpload.name}`;
    const filePath = `documents/${currentUser.id}/${newFileNameInStorage}`; // Store in user's folder for consistency
    const fileStorageRef = storageRef(storage, filePath);

    const uploadTask = uploadBytesResumable(fileStorageRef, fileToUpload);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Error subiendo nueva versión:", error);
        toast({ title: "Error al Subir Versión", description: error.message, variant: "destructive" });
        setIsUploading(false);
        setUploadProgress(0);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const nowTimestamp = serverTimestamp();
          
          // Create version history entry for the *previous* current version
          const previousVersionEntry: DocumentVersion = {
            version: documentToUpdate.currentVersion,
            fileURL: documentToUpdate.fileURL,
            fileNameInStorage: documentToUpdate.fileNameInStorage,
            uploadedAt: documentToUpdate.lastVersionUploadedAt || documentToUpdate.uploadedAt, // Use lastVersionUploadedAt if available
            uploadedByUserId: documentToUpdate.lastVersionUploadedByUserId || documentToUpdate.uploadedByUserId,
            uploadedByUserName: documentToUpdate.lastVersionUploadedByUserName || documentToUpdate.uploadedByUserName,
            fileSize: documentToUpdate.fileSize,
            fileType: documentToUpdate.fileType,
            versionNotes: "Versión anterior", // Or allow user to add notes to old version upon new upload
          };

          const docRef = doc(db, "documents", documentToUpdate.id);
          await updateDoc(docRef, {
            fileURL: downloadURL,
            fileNameInStorage: newFileNameInStorage,
            fileType: fileToUpload.type,
            fileSize: fileToUpload.size,
            lastVersionUploadedAt: nowTimestamp,
            lastVersionUploadedByUserId: currentUser.id,
            lastVersionUploadedByUserName: currentUser.name || "Usuario Desconocido",
            currentVersion: documentToUpdate.currentVersion + 1,
            versionHistory: arrayUnion(previousVersionEntry),
            description: data.versionNotes ? `${documentToUpdate.description || ''}\n\nNotas v${documentToUpdate.currentVersion + 1}: ${data.versionNotes}` : documentToUpdate.description, // Append version notes to description or store separately
          });

          toast({
            title: "Nueva Versión Subida",
            description: `El archivo "${fileToUpload.name}" ha sido subido como versión ${documentToUpdate.currentVersion + 1}.`,
          });
          onUploadSuccess();
          form.reset();
          const fileInput = document.getElementById('new-version-file-input') as HTMLInputElement | null;
          if (fileInput) fileInput.value = "";
          onOpenChange(false); // Close dialog on success
        } catch (error) {
          console.error("Error actualizando metadata del documento:", error);
          toast({ title: "Error al Guardar Versión", description: "Ocurrió un error al guardar la información de la nueva versión.", variant: "destructive" });
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-6 w-6 text-primary" />
            Subir Nueva Versión para &quot;{documentToUpdate.name}&quot;
          </DialogTitle>
          <DialogDescription>
            Vas a subir la versión {documentToUpdate.currentVersion + 1}. La versión actual ({documentToUpdate.currentVersion}) se guardará en el historial.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="file"
              render={({ fieldState }) => (
                <FormItem>
                  <FormLabel htmlFor="new-version-file-input">Nuevo Archivo</FormLabel>
                  <FormControl>
                    <Input
                      id="new-version-file-input"
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
              name="versionNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas de esta Versión (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Ej. Cambios realizados, correcciones..." {...field} disabled={isUploading} />
                  </FormControl>
                  <FormDescriptionUI>Estas notas se asociarán con la nueva versión.</FormDescriptionUI>
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
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isUploading || !currentUser}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                {isUploading ? "Subiendo..." : "Subir Nueva Versión"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
