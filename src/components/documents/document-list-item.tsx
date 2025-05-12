
"use client";

import type { DocumentFile } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Trash2, CalendarDays, UserCircle, Tags, LucideIcon, FileType, FileImage, FileAudio, FileVideo, FileArchive, FileQuestion } from "lucide-react";
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface DocumentListItemProps {
  documentFile: DocumentFile;
  onDelete: (documentId: string, storagePath: string) => void;
}

function getFileIcon(fileType: string): LucideIcon {
  if (fileType.startsWith("image/")) return FileImage;
  if (fileType.startsWith("audio/")) return FileAudio;
  if (fileType.startsWith("video/")) return FileVideo;
  if (fileType.startsWith("application/pdf")) return FileType; 
  if (fileType.startsWith("application/zip") || fileType.startsWith("application/x-rar-compressed")) return FileArchive;
  if (fileType.startsWith("text/")) return FileText;
  if (fileType.includes("word")) return FileText; 
  if (fileType.includes("excel") || fileType.includes("spreadsheet")) return FileText; 
  if (fileType.includes("powerpoint") || fileType.includes("presentation")) return FileText; 
  return FileQuestion; 
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


export function DocumentListItem({ documentFile, onDelete }: DocumentListItemProps) {
  const FileIcon = getFileIcon(documentFile.fileType);
  // Construct the full storage path for deletion
  const storagePath = `documents/${documentFile.uploadedByUserId}/${documentFile.fileNameInStorage}`;

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileIcon className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="flex-grow min-w-0">
              <CardTitle className="text-base truncate" title={documentFile.name}>
                {documentFile.name}
              </CardTitle>
              <CardDescription className="text-xs truncate">
                Tipo: {documentFile.fileType} | Tamaño: {formatFileSize(documentFile.fileSize)}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
             <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                            <a href={documentFile.fileURL} target="_blank" rel="noopener noreferrer" download={documentFile.name}>
                                <Download className="h-4 w-4" />
                            </a>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Descargar</p></TooltipContent>
                </Tooltip>
             </TooltipProvider>
            <TooltipProvider>
                 <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => onDelete(documentFile.id, storagePath)} className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Eliminar</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 space-y-1 text-xs text-muted-foreground">
        {documentFile.description && <p className="line-clamp-2">Descripción: {documentFile.description}</p>}
        <div className="flex items-center gap-1">
          <UserCircle className="h-3 w-3" />
          Subido por: {documentFile.uploadedByUserName || 'Desconocido'}
        </div>
        <div className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          Subido el: {isValid(parseISO(documentFile.uploadedAt)) ? format(parseISO(documentFile.uploadedAt), "PPp", { locale: es }) : 'Fecha inválida'}
        </div>
      </CardContent>
      {(documentFile.tags && documentFile.tags.length > 0) && (
        <CardFooter className="pt-2 pb-3 border-t flex flex-wrap gap-1">
            <Tags className="h-3 w-3 text-muted-foreground mr-1"/>
            {documentFile.tags.map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
        </CardFooter>
      )}
    </Card>
  );
}
