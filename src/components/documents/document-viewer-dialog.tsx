
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
import { Loader2, AlertTriangle, FileText, Download } from "lucide-react";
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
    let mounted = true; // Flag to track mount status

    const fetchTextContent = async () => {
      if (isOpen && documentFile && documentFile.fileType.startsWith("text/")) {
        // IMPORTANT: For this fetch to work with Firebase Storage URLs,
        // you MUST configure CORS on your Firebase Storage bucket.
        // Go to Firebase Console -> Storage -> Rules, and add a CORS configuration
        // that allows GET requests from your application's origin.
        // Example CORS config:
        // [
        //   {
        //     "origin": ["http://localhost:3000", "https://your-app-domain.com"],
        //     "method": ["GET"],
        //     "maxAgeSeconds": 3600
        //   }
        // ]
        if (mounted) {
          setIsLoadingText(true);
          setTextContent(null);
        }
        try {
          const response = await fetch(documentFile.fileURL);
          if (!response.ok) {
            throw new Error(`Error al cargar el archivo: ${response.statusText}`);
          }
          const text = await response.text();
          if (mounted) {
            setTextContent(text);
          }
        } catch (error: any) {
          console.error("Error fetching text content:", error);
          let description = "No se pudo cargar el contenido del archivo de texto.";
          if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError") || error.message?.toLowerCase().includes("cors")) {
            description += " Esto podría deberse a un problema de CORS. Asegúrate de que la configuración CORS de tu Firebase Storage bucket permite solicitudes GET desde este dominio. Busca 'Firebase Storage CORS' para más detalles.";
          }
          if (mounted) {
            toast({
              title: "Error al Cargar Contenido",
              description: description,
              variant: "destructive",
              duration: 15000,
            });
            setTextContent("Error al cargar el contenido. Revisa la consola para más detalles y verifica la configuración CORS de Firebase Storage si el error es 'Failed to fetch'.");
          }
        } finally {
          if (mounted) {
            setIsLoadingText(false);
          }
        }
      }
    };

    fetchTextContent();

    return () => {
      mounted = false; // Set to false on unmount
    };
  }, [isOpen, documentFile, toast]);

  if (!documentFile) {
    return null;
  }

  const isPdf = documentFile.fileType === "application/pdf";
  // More specific check for text types intended for direct rendering
  const isPlainText = documentFile.fileType === "text/plain" || documentFile.fileType === "text/markdown";
  const isCsv = documentFile.fileType === "text/csv";
  const isTextRenderable = isPlainText || isCsv; 

  const isDocx = documentFile.fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || documentFile.name.endsWith(".docx");
  const isXlsx = documentFile.fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || documentFile.name.endsWith(".xlsx");


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
              src={`${documentFile.fileURL}#toolbar=0&navpanes=0&scrollbar=0`}
              title={`Vista previa de ${documentFile.name}`}
              className="w-full h-full border-0"
              allowFullScreen
            />
          ) : isTextRenderable ? ( 
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
          ) : (isDocx || isXlsx) ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <FileText className="h-16 w-16 text-blue-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Visualización Avanzada Pendiente</h3>
              <p className="text-sm text-muted-foreground mb-4">
                La visualización en la aplicación para archivos {isDocx ? "DOCX" : "XLSX"} está en desarrollo y es compleja.
              </p>
              <Button asChild>
                <a href={documentFile.fileURL} download={documentFile.name} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" /> Descargar Documento para Ver
                </a>
              </Button>
            </div>
          )
           : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <AlertTriangle className="h-16 w-16 text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Visualización No Soportada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                La visualización en la aplicación para archivos de tipo &quot;{documentFile.fileType}&quot; aún no está disponible.
              </p>
              <Button asChild>
                <a href={documentFile.fileURL} download={documentFile.name} target="_blank" rel="noopener noreferrer">
                   <Download className="mr-2 h-4 w-4" /> Descargar Documento para Ver
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

