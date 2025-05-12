"use client";

import { useState, useEffect, useCallback } from "react";
import type { DocumentFile, Lead, Contact, LucideIcon as LucideIconType, DocumentVersion } from "@/lib/types";
import { NAV_ITEMS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderKanban, PlusCircle, Search, Filter, Settings2, Share, GitBranch, Info, History, FileSignature, Link as LinkIconLucide, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp, where, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { DocumentListItem } from "@/components/documents/document-list-item";
import { DocumentUploadForm } from "@/components/documents/document-upload-form"; 
import { UploadNewVersionDialog } from "@/components/documents/upload-new-version-dialog";
import { VersionHistoryDialog } from "@/components/documents/version-history-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isValid, parseISO } from "date-fns";


export default function DocumentsPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/documents');
  const PageIcon = navItem?.icon || FolderKanban;

  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSupportData, setIsLoadingSupportData] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploadFormVisible, setIsUploadFormVisible] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, storagePath: string} | null>(null);

  const [isUploadNewVersionDialogOpen, setIsUploadNewVersionDialogOpen] = useState(false);
  const [documentForNewVersion, setDocumentForNewVersion] = useState<DocumentFile | null>(null);
  const [isVersionHistoryDialogOpen, setIsVersionHistoryDialogOpen] = useState(false);
  const [documentForVersionHistory, setDocumentForVersionHistory] = useState<DocumentFile | null>(null);


  const { currentUser } = useAuth();
  const { toast } = useToast();

  const fetchDocuments = useCallback(async () => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const q = query(collection(db, "documents"), orderBy("uploadedAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedDocs = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name as string,
          fileNameInStorage: data.fileNameInStorage as string,
          fileURL: data.fileURL as string,
          fileType: data.fileType as string,
          fileSize: data.fileSize as number,
          description: data.description as (string | undefined),
          tags: data.tags as (string[] | undefined),
          uploadedAt: (data.uploadedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          uploadedByUserId: data.uploadedByUserId as string,
          uploadedByUserName: data.uploadedByUserName as string,
          lastVersionUploadedAt: (data.lastVersionUploadedAt as Timestamp)?.toDate().toISOString() || undefined,
          lastVersionUploadedByUserId: data.lastVersionUploadedByUserId as (string | undefined),
          lastVersionUploadedByUserName: data.lastVersionUploadedByUserName as (string | undefined),
          relatedLeadId: data.relatedLeadId as (string | undefined),
          relatedContactId: data.relatedContactId as (string | undefined),
          relatedOpportunityId: data.relatedOpportunityId as (string | undefined),
          relatedOrderId: data.relatedOrderId as (string | undefined),
          relatedQuoteId: data.relatedQuoteId as (string | undefined),
          relatedTicketId: data.relatedTicketId as (string | undefined),
          relatedProjectId: data.relatedProjectId as (string | undefined),
          currentVersion: data.currentVersion as number,
          versionHistory: (data.versionHistory || []).map((v: any): DocumentVersion => ({
            version: v.version as number,
            fileURL: v.fileURL as string,
            fileNameInStorage: v.fileNameInStorage as string,
            uploadedAt: (typeof v.uploadedAt === 'string' && isValid(parseISO(v.uploadedAt)))
              ? v.uploadedAt
              : (v.uploadedAt instanceof Timestamp ? v.uploadedAt.toDate().toISOString() : new Date().toISOString()),
            uploadedByUserId: v.uploadedByUserId as string,
            uploadedByUserName: v.uploadedByUserName as string,
            fileSize: v.fileSize as number,
            fileType: v.fileType as string,
            notes: v.notes as (string | undefined),
            versionNotes: v.versionNotes as (string | undefined),
          })),
          isPublic: data.isPublic as (boolean | undefined),
          sharedWithUserIds: data.sharedWithUserIds as (string[] | undefined),
          sharedWithGroupIds: data.sharedWithGroupIds as (string[] | undefined),
          accessLink: data.accessLink as (string | undefined),
          linkExpiresAt: data.linkExpiresAt as (string | undefined),
        } as DocumentFile;
      });
      setDocuments(fetchedDocs);
    } catch (error) {
      console.error("Error al obtener documentos:", error);
      toast({ title: "Error al Cargar Documentos", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, toast]);

  const fetchSupportData = useCallback(async () => {
    setIsLoadingSupportData(true);
    try {
      const [leadsSnapshot, contactsSnapshot] = await Promise.all([
        getDocs(collection(db, "leads")),
        getDocs(collection(db, "contacts")),
      ]);

      setLeads(leadsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Lead)));
      setContacts(contactsSnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()} as Contact)));
      
    } catch (error) {
      console.error("Error al obtener datos de soporte (leads, contactos):", error);
      toast({ title: "Error al Cargar Datos de Soporte", variant: "destructive"});
    } finally {
      setIsLoadingSupportData(false);
    }
  }, [toast]);


  useEffect(() => {
    fetchDocuments();
    fetchSupportData();
  }, [fetchDocuments, fetchSupportData]);

  const handleUploadSuccess = () => {
    fetchDocuments(); 
    setIsUploadFormVisible(false); 
  };

  const handleUploadNewVersionSuccess = () => {
    fetchDocuments();
    setIsUploadNewVersionDialogOpen(false);
    setDocumentForNewVersion(null);
  }

  const confirmDeleteDocument = (docId: string, storagePath: string) => {
    const docFile = documents.find(d => d.id === docId);
    // Temporarily allow deletion even with history for testing, will refine this logic.
    // if (docFile && docFile.versionHistory && docFile.versionHistory.length > 0) {
    //     toast({
    //         title: "Eliminación no permitida",
    //         description: "Este documento tiene historial de versiones. Elimina las versiones anteriores primero (Funcionalidad Próxima).",
    //         variant: "destructive",
    //         duration: 7000,
    //     });
    //     return;
    // }
    setDocumentToDelete({ id: docId, storagePath });
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete || !currentUser) return;

    // TODO: In a full versioning system, this would iterate through versionHistory
    // and delete all associated files from storage. For now, it only deletes the current version's file.
    try {
      // 1. Delete current version from Firebase Storage
      const fileRef = storageRef(storage, documentToDelete.storagePath); 
      await deleteObject(fileRef);

      // 2. Delete metadata from Firestore
      await deleteDoc(doc(db, "documents", documentToDelete.id));

      toast({ title: "Documento Eliminado", description: "El documento ha sido eliminado exitosamente." });
      fetchDocuments(); // Refresh list
    } catch (error: any) {
      console.error("Error al eliminar documento:", error);
      if (error.code === 'storage/object-not-found') {
         try {
            await deleteDoc(doc(db, "documents", documentToDelete.id));
            toast({ title: "Referencia de Documento Eliminada", description: "El archivo no se encontró en el almacenamiento, pero la referencia fue eliminada.", variant: "default" });
            fetchDocuments();
         } catch (dbError) {
            toast({ title: "Error al Eliminar Referencia", description: "No se pudo eliminar la referencia del documento.", variant: "destructive" });
         }
      } else {
        toast({ title: "Error al Eliminar Documento", description: String(error.message || error), variant: "destructive" });
      }
    } finally {
      setDocumentToDelete(null);
    }
  };

  const openUploadNewVersionDialog = (docFile: DocumentFile) => {
    setDocumentForNewVersion(docFile);
    setIsUploadNewVersionDialogOpen(true);
  };

  const openVersionHistoryDialog = (docFile: DocumentFile) => {
    setDocumentForVersionHistory(docFile);
    setIsVersionHistoryDialogOpen(true);
  };

  const handleRestoreVersion = async (documentId: string, versionToRestore: DocumentVersion) => {
    if (!currentUser) {
      toast({ title: "Error de autenticación", variant: "destructive"});
      return;
    }
    try {
      const docRef = doc(db, "documents", documentId);
      const currentDocSnap = await getDoc(docRef);

      if (!currentDocSnap.exists()) {
        toast({ title: "Error", description: "Documento no encontrado.", variant: "destructive" });
        return;
      }
      const currentDocData = currentDocSnap.data() as DocumentFile;

      const versionBeingReplaced: DocumentVersion = {
        version: currentDocData.currentVersion,
        fileURL: currentDocData.fileURL,
        fileNameInStorage: currentDocData.fileNameInStorage,
        uploadedAt: currentDocData.lastVersionUploadedAt || currentDocData.uploadedAt,
        uploadedByUserId: currentDocData.lastVersionUploadedByUserId || currentDocData.uploadedByUserId,
        uploadedByUserName: currentDocData.lastVersionUploadedByUserName || currentDocData.uploadedByUserName,
        fileSize: currentDocData.fileSize,
        fileType: currentDocData.fileType,
        notes: currentDocData.description, // Using current description as notes for the replaced version.
        versionNotes: currentDocData.description,
      };

      const updatedVersionHistory = [...(currentDocData.versionHistory || []), versionBeingReplaced];

      await updateDoc(docRef, {
        fileURL: versionToRestore.fileURL,
        fileNameInStorage: versionToRestore.fileNameInStorage,
        fileType: versionToRestore.fileType,
        fileSize: versionToRestore.fileSize,
        description: versionToRestore.notes || versionToRestore.versionNotes, // Use the notes from the version being restored
        lastVersionUploadedAt: serverTimestamp(),
        lastVersionUploadedByUserId: currentUser.id,
        lastVersionUploadedByUserName: currentUser.name || "Usuario Desconocido",
        currentVersion: currentDocData.currentVersion + 1,
        versionHistory: updatedVersionHistory,
      });

      toast({ title: "Versión Restaurada", description: `El documento ha sido restaurado a la versión ${versionToRestore.version}.` });
      fetchDocuments();
    } catch (error) {
      console.error("Error restaurando versión:", error);
      toast({ title: "Error al Restaurar Versión", description: String(error), variant: "destructive" });
    }
  };


  const filteredDocuments = documents.filter(docFile => 
    docFile.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (docFile.description && docFile.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (docFile.tags && docFile.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
  );
  
  const renderFutureFeatureCard = (title: string, Icon: LucideIconType, description: string, features: string[], implemented: boolean = false, partiallyImplemented: boolean = false) => (
    <Card className={implemented ? "bg-green-50 border-green-200" : (partiallyImplemented ? "bg-yellow-50 border-yellow-200" : "bg-muted/30")}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-lg ${implemented ? 'text-green-700' : (partiallyImplemented ? 'text-yellow-600' : 'text-amber-500')}`}>
          <Icon className="h-5 w-5" />
          {title} {implemented ? "" : (partiallyImplemented ? "(Parcialmente Implementado)" : "(Próximamente)")}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          {features.map(f => <li key={f}>{f}</li>)}
        </ul>
      </CardContent>
    </Card>
  );


  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                <PageIcon className="h-6 w-6 text-primary" />
                {navItem?.label || "Gestión de Documentos"}
                </CardTitle>
                <CardDescription>
                Organiza y gestiona todos los documentos relacionados con tus clientes, ventas y proyectos.
                </CardDescription>
            </div>
            <Button onClick={() => setIsUploadFormVisible(prev => !prev)} disabled={!currentUser || isLoadingSupportData}>
                <PlusCircle className="mr-2 h-4 w-4" /> {isUploadFormVisible ? "Cancelar Subida" : "Subir Documento"}
            </Button>
          </div>
        </CardHeader>
        {isUploadFormVisible && (
            <CardContent>
                {isLoadingSupportData ? (
                    <Skeleton className="h-60 w-full max-w-lg" />
                ) : (
                    <DocumentUploadForm 
                        currentUser={currentUser} 
                        onUploadSuccess={handleUploadSuccess}
                        leads={leads}
                        contacts={contacts}
                    />
                )}
            </CardContent>
        )}
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Documentos Almacenados</CardTitle>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    type="search" 
                    placeholder="Buscar por nombre, descripción o etiqueta..." 
                    className="pl-8 w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button variant="outline" disabled>
                <Filter className="mr-2 h-4 w-4" /> Filtrar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : filteredDocuments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map(docFile => (
                <DocumentListItem 
                  key={docFile.id} 
                  documentFile={docFile} 
                  onDelete={confirmDeleteDocument}
                  onUploadNewVersion={openUploadNewVersionDialog}
                  onViewHistory={openVersionHistoryDialog}
                  leads={leads}
                  contacts={contacts}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <FolderKanban className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg">No hay documentos.</p>
               {searchTerm ? <p>Intenta con otro término de búsqueda.</p> : <p>Empieza subiendo tu primer documento.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
         {renderFutureFeatureCard(
            "Asociación de Documentos",
            LinkIconLucide,
            "Vincula documentos a leads, contactos, oportunidades, etc.",
            ["Seleccionar lead/contacto al subir (Implementado).", "Ver documentos desde la ficha del lead/contacto (Pendiente)."],
            true
        )}
        {renderFutureFeatureCard(
            "Control de Versiones",
            History,
            "Mantén un historial de cambios y accede a versiones anteriores.",
            ["Estructura básica para versionamiento implementada (v1 inicial).", "Subir nueva versión de un documento existente (Implementado).", "Ver historial de versiones (Implementado).", "Restaurar versión anterior (Implementado)."],
            true
        )}
        {renderFutureFeatureCard(
            "Plantillas de Documentos",
            FileSignature,
            "Crea y gestiona plantillas para propuestas, contratos, etc.",
            ["Crear plantillas con campos personalizables.", "Generar documentos a partir de plantillas."]
        )}
         {renderFutureFeatureCard(
            "Compartir Documentos",
            Share,
            "Comparte documentos de forma segura con clientes o colaboradores.",
            ["Generar enlaces seguros para compartir.", "Establecer permisos de acceso (ver, editar).", "Notificaciones de acceso."]
        )}
         {renderFutureFeatureCard(
            "Integración con Almacenamiento en la Nube",
            Settings2, 
            "Conecta con servicios como Google Drive o Dropbox (Funcionalidad Avanzada).",
            ["Sincronizar documentos desde/hacia almacenamientos externos.", "Autenticación con servicios de terceros."]
        )}
        {renderFutureFeatureCard(
            "Información Adicional",
            Info,
            "Funcionalidades en desarrollo.",
            ["Búsqueda avanzada y filtros más detallados.", "Auditoría de acceso a documentos.", "Flujos de aprobación de documentos."]
        )}
      </div>

      {documentToDelete && (
        <AlertDialog open={!!documentToDelete} onOpenChange={() => setDocumentToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El documento &quot;{documents.find(d => d.id === documentToDelete.id)?.name}&quot; será eliminado permanentemente del almacenamiento y de la base de datos. 
                Si existen múltiples versiones, esta acción solo elimina la versión actual listada y su registro. (La eliminación de todas las versiones históricas de almacenamiento es una funcionalidad pendiente).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDocumentToDelete(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteDocument} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Sí, eliminar documento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {documentForNewVersion && currentUser &&(
        <UploadNewVersionDialog
          isOpen={isUploadNewVersionDialogOpen}
          onOpenChange={setIsUploadNewVersionDialogOpen}
          documentToUpdate={documentForNewVersion}
          currentUser={currentUser}
          onUploadSuccess={handleUploadNewVersionSuccess}
        />
      )}

      {documentForVersionHistory && (
        <VersionHistoryDialog
          isOpen={isVersionHistoryDialogOpen}
          onOpenChange={setIsVersionHistoryDialogOpen}
          documentFile={documentForVersionHistory}
          onRestoreVersion={handleRestoreVersion}
        />
      )}
    </div>
  );
}
