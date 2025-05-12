"use client";

import { useState, useEffect } from "react";
import type { DocumentFile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DocumentViewerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentFile: DocumentFile | null;
}

export function DocumentViewerDialog({
  isOpen,
  onOpenChange,
  documentFile,
}: DocumentViewerDialogProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTextContent = async () => {
      if (isOpen && documentFile && documentFile.fileType.startsWith("text/")) {
        setIsLoadingText(true);
        setTextContent(null);
        try {
          const response = await fetch(documentFile.fileURL);
          if (!response.ok) {
            throw new Error(`Error al cargar el archivo: ${response.statusText}`);
          }
          const text = await response.text();
          setTextContent(text);
        } catch (error) {
          console.error("Error fetching text content:", error);
          toast({
            title: "Error al Cargar Contenido",
            description: "No se pudo cargar el contenido del archivo de texto.",
            variant: "destructive",
          });
          setTextContent("Error al cargar el contenido.");
        } finally {
          setIsLoadingText(false);
        }
      }
    };

    fetchTextContent();
  }, [isOpen, documentFile, toast]);

  if (!documentFile) {
    return null;
  }

  const isPdf = documentFile.fileType === "application/pdf";
  const isText = documentFile.fileType.startsWith("text/");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate" title={documentFile.name}>
            Visualizando: {documentFile.name}
          </DialogTitle>
          <DialogDescription>
            Tipo: {documentFile.fileType} | Versión: {documentFile.currentVersion}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-hidden border rounded-md bg-muted flex items-center justify-center p-1">
          {isPdf ? (
            <iframe
              src={documentFile.fileURL}
              title={`Vista previa de ${documentFile.name}`}
              className="w-full h-full border-0"
              allowFullScreen
            />
          ) : isText ? (
            isLoadingText ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Cargando contenido del texto...</p>
              </div>
            ) : (
              <ScrollArea className="w-full h-full p-4 bg-background">
                <pre className="text-sm whitespace-pre-wrap break-all">{textContent || "No hay contenido para mostrar o error al cargar."}</pre>
              </ScrollArea>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <AlertTriangle className="h-16 w-16 text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Visualización No Soportada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                La visualización en la aplicación para archivos de tipo &quot;{documentFile.fileType}&quot; aún no está disponible.
              </p>
              <Button asChild>
                <a href={documentFile.fileURL} download={documentFile.name} target="_blank" rel="noopener noreferrer">
                  Descargar Documento para Ver
                </a>
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 mt-auto border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
