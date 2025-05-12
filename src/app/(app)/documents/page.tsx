
"use client";

import { useState, useEffect, useCallback } from "react";
import type { DocumentFile, Lead, Contact, LucideIcon as LucideIconType, DocumentVersion, DocumentTemplate, User } from "@/lib/types";
import { NAV_ITEMS, DOCUMENT_TEMPLATE_CATEGORIES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderKanban, PlusCircle, Search, Filter, Settings2, Share, GitBranch, Info, History, FileSignature, Link as LinkIconLucide, RotateCcw, Library, Play } from "lucide-react";
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
import { AddEditDocumentTemplateDialog } from "@/components/documents/add-edit-document-template-dialog";
import { DocumentTemplateListItem } from "@/components/documents/document-template-list-item";
import { GenerateDocumentFromTemplateDialog } from "@/components/documents/generate-document-from-template-dialog";
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
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [isLoading, setIsLoading] = useState(true); // For documents
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true); // For templates
  const [isLoadingSupportData, setIsLoadingSupportData] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");

  const [isUploadFormVisible, setIsUploadFormVisible] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, storagePath: string} | null>(null);

  const [isUploadNewVersionDialogOpen, setIsUploadNewVersionDialogOpen] = useState(false);
  const [documentForNewVersion, setDocumentForNewVersion] = useState<DocumentFile | null>(null);
  const [isVersionHistoryDialogOpen, setIsVersionHistoryDialogOpen] = useState(false);
  const [documentForVersionHistory, setDocumentForVersionHistory] = useState<DocumentFile | null>(null);

  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<DocumentTemplate | null>(null);

  const [isGenerateDocumentDialogOpen, setIsGenerateDocumentDialogOpen] = useState(false);
  const [templateForGeneration, setTemplateForGeneration] = useState<DocumentTemplate | null>(null);


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
          basedOnTemplateId: data.basedOnTemplateId as (string | undefined),
          templateVariablesFilled: data.templateVariablesFilled as (Record<string, string> | undefined),
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

  const fetchDocumentTemplates = useCallback(async () => {
    if (!currentUser) {
      setIsLoadingTemplates(false);
      return;
    }
    setIsLoadingTemplates(true);
    try {
      const q = query(collection(db, "documentTemplates"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedTemplates = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString() || undefined,
        } as DocumentTemplate;
      });
      setDocumentTemplates(fetchedTemplates);
    } catch (error) {
      console.error("Error al obtener plantillas de documentos:", error);
      toast({ title: "Error al Cargar Plantillas", variant: "destructive" });
    } finally {
      setIsLoadingTemplates(false);
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
    fetchDocumentTemplates();
    fetchSupportData();
  }, [fetchDocuments, fetchDocumentTemplates, fetchSupportData]);

  const handleUploadSuccess = () => {
    fetchDocuments(); 
    setIsUploadFormVisible(false); 
  };

  const handleUploadNewVersionSuccess = () => {
    fetchDocuments();
    setIsUploadNewVersionDialogOpen(false);
    setDocumentForNewVersion(null);
  }
  
  const handleSaveTemplateSuccess = () => {
    fetchDocumentTemplates();
    setIsTemplateDialogOpen(false);
    setEditingTemplate(null);
  }

  const handleGenerateDocumentSuccess = (newDocument: DocumentFile) => {
    fetchDocuments();
    toast({ title: "Documento Generado", description: `El documento "${newDocument.name}" ha sido creado exitosamente.`});
    setIsGenerateDocumentDialogOpen(false);
    setTemplateForGeneration(null);
  };

  const confirmDeleteDocument = (docId: string, storagePath: string) => {
    setDocumentToDelete({ id: docId, storagePath });
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete || !currentUser) return;
    try {
      // First, delete all files in versionHistory from storage
      const docSnap = await getDoc(doc(db, "documents", documentToDelete.id));
      if (docSnap.exists()) {
        const docData = docSnap.data() as DocumentFile;
        if (docData.versionHistory && docData.versionHistory.length > 0) {
          for (const version of docData.versionHistory) {
            if (version.fileNameInStorage) {
              // Construct full path for versioned file, assuming same user uploaded
              const versionStoragePath = `documents/${version.uploadedByUserId}/${version.fileNameInStorage}`;
              const versionFileRef = storageRef(storage, versionStoragePath);
              await deleteObject(versionFileRef).catch(err => console.warn(`Error eliminando archivo de versión ${version.version} de storage:`, err));
            }
          }
        }
      }
      // Then, delete the current version file from storage
      const currentFileRef = storageRef(storage, documentToDelete.storagePath); 
      await deleteObject(currentFileRef).catch(err => console.warn(`Error eliminando archivo actual de storage:`, err));

      // Finally, delete the document record from Firestore
      await deleteDoc(doc(db, "documents", documentToDelete.id));
      toast({ title: "Documento Eliminado", description: "El documento y todas sus versiones han sido eliminados exitosamente." });
      fetchDocuments(); 
    } catch (error: any) {
      console.error("Error al eliminar documento:", error);
      toast({ title: "Error al Eliminar Documento", description: String(error.message || error), variant: "destructive" });
    } finally {
      setDocumentToDelete(null);
    }
  };
  
  const confirmDeleteTemplate = (template: DocumentTemplate) => {
    setTemplateToDelete(template);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete || !currentUser) return;
    try {
      if (templateToDelete.fileURL && templateToDelete.fileNameInStorage) {
        const templateFileRef = storageRef(storage, `documentTemplates/${templateToDelete.createdByUserId}/${templateToDelete.fileNameInStorage}`);
        await deleteObject(templateFileRef).catch(err => console.warn("Error eliminando archivo de plantilla de storage:", err));
      }
      await deleteDoc(doc(db, "documentTemplates", templateToDelete.id));
      toast({ title: "Plantilla Eliminada", description: "La plantilla de documento ha sido eliminada." });
      fetchDocumentTemplates();
    } catch (error) {
      console.error("Error al eliminar plantilla:", error);
      toast({ title: "Error al Eliminar Plantilla", variant: "destructive" });
    } finally {
      setTemplateToDelete(null);
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
  
  const openNewTemplateDialog = () => {
    setEditingTemplate(null);
    setIsTemplateDialogOpen(true);
  };

  const openEditTemplateDialog = (template: DocumentTemplate) => {
    setEditingTemplate(template);
    setIsTemplateDialogOpen(true);
  };

  const openGenerateDocumentDialog = (template: DocumentTemplate) => {
    setTemplateForGeneration(template);
    setIsGenerateDocumentDialogOpen(true);
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
      
      // The version being replaced (current active version) becomes a new history entry
      const versionBeingReplaced: DocumentVersion = {
        version: currentDocData.currentVersion,
        fileURL: currentDocData.fileURL,
        fileNameInStorage: currentDocData.fileNameInStorage,
        uploadedAt: currentDocData.lastVersionUploadedAt || currentDocData.uploadedAt,
        uploadedByUserId: currentDocData.lastVersionUploadedByUserId || currentDocData.uploadedByUserId,
        uploadedByUserName: currentDocData.lastVersionUploadedByUserName || currentDocData.uploadedByUserName,
        fileSize: currentDocData.fileSize,
        fileType: currentDocData.fileType,
        notes: currentDocData.description, // Or a specific note about this version before restore
        versionNotes: `Restaurado desde v${versionToRestore.version}. Versión anterior era v${currentDocData.currentVersion}.`,
      };
      
      // Remove the versionToRestore from history (if it exists there) because it's becoming current
      const filteredOldHistory = (currentDocData.versionHistory || []).filter(
        (v) => v.version !== versionToRestore.version 
      );

      const updatedVersionHistory = [...filteredOldHistory, versionBeingReplaced]
        .sort((a, b) => a.version - b.version); 

      const newCurrentVersionNumber = currentDocData.currentVersion + 1;

      await updateDoc(docRef, {
        name: versionToRestore.versionNotes ? `${documentFile.name.split(' (v')[0]} (Restaurado desde v${versionToRestore.version})` : documentFile.name, // Optionally update name
        fileURL: versionToRestore.fileURL,
        fileNameInStorage: versionToRestore.fileNameInStorage,
        fileType: versionToRestore.fileType,
        fileSize: versionToRestore.fileSize,
        description: versionToRestore.notes || versionToRestore.versionNotes || "", 
        lastVersionUploadedAt: serverTimestamp(),
        lastVersionUploadedByUserId: currentUser.id,
        lastVersionUploadedByUserName: currentUser.name || "Usuario Desconocido",
        currentVersion: newCurrentVersionNumber, 
        versionHistory: updatedVersionHistory,
      });

      toast({ title: "Versión Restaurada", description: `El contenido de la versión ${versionToRestore.version} es ahora la versión actual ${newCurrentVersionNumber}.` });
      fetchDocuments();
      setIsVersionHistoryDialogOpen(false); // Close dialog after action
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
  
  const filteredDocumentTemplates = documentTemplates.filter(template =>
    template.name.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
    (template.description && template.description.toLowerCase().includes(templateSearchTerm.toLowerCase())) ||
    (template.category && template.category.toLowerCase().includes(templateSearchTerm.toLowerCase()))
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
                Organiza, gestiona y versiona documentos y plantillas.
                </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="documents" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="documents"><FolderKanban className="mr-2 h-4 w-4" />Documentos</TabsTrigger>
          <TabsTrigger value="templates"><Library className="mr-2 h-4 w-4" />Plantillas</TabsTrigger>
        </TabsList>
        
        <TabsContent value="documents">
            <Card className="mt-4">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <CardTitle>Documentos Almacenados</CardTitle>
                        <Button onClick={() => setIsUploadFormVisible(prev => !prev)} disabled={!currentUser || isLoadingSupportData}>
                            <PlusCircle className="mr-2 h-4 w-4" /> {isUploadFormVisible ? "Cancelar Subida" : "Subir Documento"}
                        </Button>
                    </div>
                    {isUploadFormVisible && (
                        <CardContent className="p-0 pt-4">
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
                    <div className="flex gap-2 mt-4">
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
        </TabsContent>

        <TabsContent value="templates">
           <Card className="mt-4">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <CardTitle>Plantillas de Documentos</CardTitle>
                        <Button onClick={openNewTemplateDialog} disabled={!currentUser}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Nueva Plantilla
                        </Button>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <div className="relative flex-grow">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                type="search" 
                                placeholder="Buscar por nombre, descripción o categoría..." 
                                className="pl-8 w-full"
                                value={templateSearchTerm}
                                onChange={(e) => setTemplateSearchTerm(e.target.value)}
                            />
                        </div>
                         <Button variant="outline" disabled>
                            <Filter className="mr-2 h-4 w-4" /> Filtrar
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingTemplates ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
                        </div>
                    ) : filteredDocumentTemplates.length > 0 ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredDocumentTemplates.map(template => (
                                <DocumentTemplateListItem
                                    key={template.id}
                                    template={template}
                                    onEdit={openEditTemplateDialog}
                                    onDelete={confirmDeleteTemplate}
                                    onGenerate={openGenerateDocumentDialog}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            <Library className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                            <p className="text-lg">No hay plantillas de documentos.</p>
                            {templateSearchTerm ? <p>Intenta con otro término de búsqueda.</p> : <p>Crea tu primera plantilla.</p>}
                        </div>
                    )}
                </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
      
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
            ["Subir nueva versión de un documento existente (Implementado).", "Ver historial de versiones (Implementado).", "Restaurar versión anterior (Implementado).", "Comparación IA entre versiones (Beta Implementada)."],
            true
        )}
        {renderFutureFeatureCard(
            "Plantillas de Documentos",
            FileSignature,
            "Crea y gestiona plantillas para propuestas, contratos, etc.",
            ["Crear plantillas (nombre, descripción, categoría, contenido simple o archivo - Implementado).", "Listar y buscar plantillas (Implementado).", "Generar documentos a partir de plantillas (Implementado).", "Campos personalizables en plantillas (Implementado a través de 'variables')."],
            true
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
                Esta acción no se puede deshacer. El documento &quot;{documents.find(d => d.id === documentToDelete.id)?.name}&quot; y todas sus versiones serán eliminados permanentemente del almacenamiento y de la base de datos.
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
       {templateToDelete && (
        <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar Plantilla?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. La plantilla &quot;{templateToDelete.name}&quot; será eliminada permanentemente.
                {templateToDelete.fileURL && " También se eliminará el archivo asociado del almacenamiento."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTemplateToDelete(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Sí, eliminar plantilla
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

      {currentUser && (
         <AddEditDocumentTemplateDialog
            isOpen={isTemplateDialogOpen}
            onOpenChange={setIsTemplateDialogOpen}
            templateToEdit={editingTemplate}
            currentUser={currentUser}
            onSaveSuccess={handleSaveTemplateSuccess}
        />
      )}
      {currentUser && templateForGeneration && (
        <GenerateDocumentFromTemplateDialog
            isOpen={isGenerateDocumentDialogOpen}
            onOpenChange={setIsGenerateDocumentDialogOpen}
            template={templateForGeneration}
            currentUser={currentUser}
            onGenerateSuccess={handleGenerateDocumentSuccess}
            leads={leads}
            contacts={contacts}
        />
      )}
    </div>
  );
}
