"use client";

import type { DocumentFile, DocumentVersion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, UserCircle, CalendarDays, MessageSquareText, FileText } from "lucide-react";
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

interface VersionHistoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentFile: DocumentFile;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function VersionHistoryDialog({
  isOpen,
  onOpenChange,
  documentFile,
}: VersionHistoryDialogProps) {

  // Combine current version and history for display, sorted by version number descending
  const allVersions: (DocumentVersion & { isCurrent?: boolean })[] = [
    {
      version: documentFile.currentVersion,
      fileURL: documentFile.fileURL,
      fileNameInStorage: documentFile.fileNameInStorage,
      uploadedAt: documentFile.lastVersionUploadedAt || documentFile.uploadedAt,
      uploadedByUserId: documentFile.lastVersionUploadedByUserId || documentFile.uploadedByUserId,
      uploadedByUserName: documentFile.lastVersionUploadedByUserName || documentFile.uploadedByUserName,
      notes: `Versión actual. ${documentFile.description || ''}`, // Could be improved if version notes are separate
      fileSize: documentFile.fileSize,
      fileType: documentFile.fileType,
      isCurrent: true,
    },
    ...(documentFile.versionHistory || []),
  ].sort((a, b) => b.version - a.version);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Historial de Versiones: {documentFile.name}
          </DialogTitle>
          <DialogDescription>
            Visualiza todas las versiones de este documento. La versión más reciente es la actual.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Versión</TableHead>
                <TableHead>Subido Por</TableHead>
                <TableHead>Fecha de Subida</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allVersions.length > 0 ? allVersions.map((version) => (
                <TableRow key={version.version} className={version.isCurrent ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Badge variant={version.isCurrent ? "default" : "secondary"}>
                      v{version.version} {version.isCurrent && "(Actual)"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs">
                      <UserCircle className="h-4 w-4 text-muted-foreground" />
                      {version.uploadedByUserName || "Desconocido"}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3 text-muted-foreground" />
                        {isValid(parseISO(version.uploadedAt)) ? format(parseISO(version.uploadedAt), "PPp", { locale: es }) : 'Fecha inválida'}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{formatFileSize(version.fileSize)}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate" title={version.notes || version.versionNotes}>
                    {version.notes || version.versionNotes || "Sin notas"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <a href={version.fileURL} target="_blank" rel="noopener noreferrer" download={`${documentFile.name} (v${version.version})`}>
                        <Download className="mr-2 h-3 w-3" /> Descargar
                      </a>
                    </Button>
                    {/* Placeholder for Restore button */}
                    {/* {!version.isCurrent && (
                      <Button variant="ghost" size="sm" className="ml-2" onClick={() => alert('Restaurar - Próximamente')}>
                        Restaurar
                      </Button>
                    )} */}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay historial de versiones disponible además de la actual.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
