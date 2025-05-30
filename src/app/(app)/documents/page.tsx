
"use client";

import { useState, useEffect, useCallback } from "react";
import type { DocumentFile, Lead, Contact, LucideIcon as LucideIconType, DocumentVersion, DocumentTemplate, User, DocumentUserPermission, DocumentGroupPermission } from "@/lib/types";
import { NAV_ITEMS, DOCUMENT_TEMPLATE_CATEGORIES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderKanban, PlusCircle, Search, Filter, Settings2, Share2 as ShareIconLucide, GitBranch, Info, History, FileSignature, Link as LinkIconLucideReal, RotateCcw, Library, Play, Users, Eye, Bell, Users2, View } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { redirect } from "next/navigation";
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
import { DocumentViewerDialog } from "@/components/documents/document-viewer-dialog";
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
import { Badge } from "@/components/ui/badge";
import { logSystemEvent } from "@/lib/auditLogger"; // Import audit logger


export default function DocumentsPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/documents');
  const PageIcon = navItem?.icon || FolderKanban;

  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);


  const [isLoading, setIsLoading] = useState(true); 
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true); 
  const [isLoadingSupportData, setIsLoadingSupportData] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");

  const [isUploadFormVisible, setIsUploadFormVisible] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, storagePath: string, name: string} | null>(null);

  const [isUploadNewVersionDialogOpen, setIsUploadNewVersionDialogOpen] = useState(false);
  const [documentForNewVersion, setDocumentForNewVersion] = useState<DocumentFile | null>(null);
  const [isVersionHistoryDialogOpen, setIsVersionHistoryDialogOpen] = useState(false);
  const [documentForVersionHistory, setDocumentForVersionHistory] = useState<DocumentFile | null>(null);

  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<DocumentTemplate | null>(null);

  const [isGenerateDocumentDialogOpen, setIsGenerateDocumentDialogOpen] = useState(false);
  const [templateForGeneration, setTemplateForGeneration] = useState<DocumentTemplate | null>(null);

  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);
  const [documentToView, setDocumentToView] = useState<DocumentFile | null>(null);


  const { currentUser, getAllUsers, loading, hasPermission } = useAuth();
  const { toast } = useToast();

  const fetchDocuments = useCallback(async () => {
    if (!currentUser) {
      setIsLoading(false);
      setDocuments([]);
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
          permissions: {
            users: (data.permissions?.users || []).map((p:any): DocumentUserPermission => ({
                userId: p.userId,
                userName: p.userName,
                email: p.email,
                avatarUrl: p.avatarUrl,
                level: p.level,
            })),
            groups: (data.permissions?.groups || []).map((p:any): DocumentGroupPermission => ({
                groupId: p.groupId,
                groupName: p.groupName,
                level: p.level,
            })),
          },
          accessKey: data.accessKey as (string | undefined),
          basedOnTemplateId: data.basedOnTemplateId as (string | undefined),
          templateVariablesFilled: data.templateVariablesFilled as (Record<string, string> | undefined),
        } as DocumentFile;
      });

      const userVisibleDocuments = fetchedDocs.filter(docFile =>
        docFile.uploadedByUserId === currentUser.id || 
        docFile.permissions?.users?.some(p => p.userId === currentUser.id) || 
        (docFile.permissions?.groups?.some(pg => currentUser.role === 'admin' || (currentUser.groups?.includes(pg.groupId)))) || 
        docFile.isPublic 
      );

      setDocuments(userVisibleDocuments);
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
      const [leadsSnapshot, contactsSnapshot, usersData] = await Promise.all([
        getDocs(collection(db, "leads")),
        getDocs(collection(db, "contacts")),
        getAllUsers(),
      ]);

      setLeads(leadsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Lead)));
      setContacts(contactsSnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()} as Contact)));
      setAllUsers(usersData);

    } catch (error) {
      console.error("Error al obtener datos de soporte (leads, contactos, usuarios):", error);
      toast({ title: "Error al Cargar Datos de Soporte", variant: "destructive"});
    } finally {
      setIsLoadingSupportData(false);
    }
  }, [getAllUsers, toast]);


  useEffect(() => {
    fetchDocuments();
    fetchDocumentTemplates();
    fetchSupportData();
  }, [fetchDocuments, fetchDocumentTemplates, fetchSupportData]);

  if (!loading && !hasPermission('ver-documentos')) {
    redirect('/access-denied');
  }

  const handleUploadSuccess = (uploadedFileName: string) => {
    fetchDocuments();
    setIsUploadFormVisible(false);
    if (currentUser) {
      logSystemEvent(currentUser, 'file_upload', 'Document', uploadedFileName, `Documento "${uploadedFileName}" subido.`);
    }
  };

  const handleUploadNewVersionSuccess = (docName: string, newVersion: number) => {
    fetchDocuments();
    setIsUploadNewVersionDialogOpen(false);
    setDocumentForNewVersion(null);
     if (currentUser) {
      logSystemEvent(currentUser, 'update', 'Document', docName, `Nueva versión ${newVersion} subida para "${docName}".`);
    }
  }

  const handleSaveTemplateSuccess = (templateName: string, isEditing: boolean) => {
    fetchDocumentTemplates();
    setIsTemplateDialogOpen(false);
    setEditingTemplate(null);
    if (currentUser) {
      const action = isEditing ? 'update' : 'create';
      logSystemEvent(currentUser, action, 'DocumentTemplate', templateName, `Plantilla de documento "${templateName}" ${isEditing ? 'actualizada' : 'creada'}.`);
    }
  }

  const handleGenerateDocumentSuccess = (newDocument: DocumentFile) => {
    fetchDocuments();
    toast({ title: "Documento Generado", description: `El documento "${newDocument.name}" ha sido creado exitosamente.`});
    setIsGenerateDocumentDialogOpen(false);
    setTemplateForGeneration(null);
    if (currentUser) {
      logSystemEvent(currentUser, 'create', 'Document', newDocument.id, `Documento "${newDocument.name}" generado desde plantilla "${templateForGeneration?.name}".`);
    }
  };

  const confirmDeleteDocument = (docId: string, storagePath: string, docName: string) => {
    setDocumentToDelete({ id: docId, storagePath, name: docName });
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete || !currentUser) return;
    const { id: docId, name: docName } = documentToDelete;
    try {
      // First, delete all files in versionHistory from storage
      const docSnap = await getDoc(doc(db, "documents", documentToDelete.id));
      if (docSnap.exists()) {
        const docData = docSnap.data() as DocumentFile;
        if (docData.versionHistory && docData.versionHistory.length > 0) {
          for (const version of docData.versionHistory) {
            if (version.fileNameInStorage) {
              const versionUploaderId = version.uploadedByUserId;
              const versionStoragePath = `documents/${versionUploaderId}/${version.fileNameInStorage}`;
              const versionFileRef = storageRef(storage, versionStoragePath);
              await deleteObject(versionFileRef).catch(err => console.warn(`Error eliminando archivo de versión ${version.version} de storage:`, err));
            }
          }
        }
      }
      const currentFileRef = storageRef(storage, documentToDelete.storagePath);
      await deleteObject(currentFileRef).catch(err => console.warn(`Error eliminando archivo actual de storage:`, err));

      await deleteDoc(doc(db, "documents", documentToDelete.id));
      toast({ title: "Documento Eliminado", description: `El documento "${docName}" y todas sus versiones han sido eliminados.` });
      fetchDocuments();
      await logSystemEvent(currentUser, 'delete', 'Document', docId, `Documento "${docName}" eliminado.`);
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
      if (templateToDelete.fileURL && templateToDelete.fileNameInStorage && templateToDelete.createdByUserId) {
        const templateFileRef = storageRef(storage, `documentTemplates/${templateToDelete.createdByUserId}/${templateToDelete.fileNameInStorage}`);
        await deleteObject(templateFileRef).catch(err => console.warn("Error eliminando archivo de plantilla de storage:", err));
      }
      await deleteDoc(doc(db, "documentTemplates", templateToDelete.id));
      toast({ title: "Plantilla Eliminada", description: `La plantilla de documento "${templateToDelete.name}" ha sido eliminada.` });
      fetchDocumentTemplates();
      await logSystemEvent(currentUser, 'delete', 'DocumentTemplate', templateToDelete.id, `Plantilla de documento "${templateToDelete.name}" eliminada.`);
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

  const handleTogglePublic = async (documentId: string, currentIsPublic: boolean, docName: string) => {
    if (!currentUser) return;
    try {
      const docRef = doc(db, "documents", documentId);
      await updateDoc(docRef, {
        isPublic: !currentIsPublic,
        updatedAt: serverTimestamp(),
      });
      const newVisibility = !currentIsPublic ? "público" : "privado";
      toast({
        title: "Visibilidad Actualizada",
        description: `El documento es ahora ${newVisibility}.`,
      });
      fetchDocuments();
      await logSystemEvent(currentUser, 'access_change', 'Document', documentId, `Visibilidad de "${docName}" cambiada a ${newVisibility}.`);
    } catch (error) {
      console.error("Error actualizando visibilidad del documento:", error);
      toast({ title: "Error al Actualizar Visibilidad", variant: "destructive" });
    }
  };

  const handleUpdateSharingSettings = async (documentId: string, newPermissions: DocumentFile['permissions'], docName: string) => {
     if (!currentUser) return;
    try {
      const docRef = doc(db, "documents", documentId);
      const permissionsToSave = {
        users: newPermissions?.users || [],
        groups: newPermissions?.groups || [],
      };
      await updateDoc(docRef, {
        permissions: permissionsToSave,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: "Permisos Actualizados",
        description: `Los permisos de compartición del documento "${docName}" han sido actualizados.`,
      });
      fetchDocuments();
      await logSystemEvent(currentUser, 'access_change', 'Document', documentId, `Permisos de "${docName}" actualizados.`);
    } catch (error) {
      console.error("Error actualizando permisos de compartición:", error);
      toast({ title: "Error al Actualizar Permisos", variant: "destructive" });
    }
  };

  const handleViewDocument = (docFile: DocumentFile) => {
    setDocumentToView(docFile);
    setIsDocumentViewerOpen(true);
  };

  const handleRestoreVersion = async (documentId: string, versionToRestore: DocumentVersion, docName: string) => {
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
        notes: currentDocData.description,
        versionNotes: `Restaurado desde v${versionToRestore.version}. Versión anterior era v${currentDocData.currentVersion}.`,
      };

      const filteredOldHistory = (currentDocData.versionHistory || []).filter(
        (v) => v.version !== versionToRestore.version
      );

      const updatedVersionHistory = [...filteredOldHistory, versionBeingReplaced]
        .sort((a, b) => a.version - b.version);

      const newCurrentVersionNumber = currentDocData.currentVersion + 1;

      await updateDoc(docRef, {
        name: versionToRestore.versionNotes ? `${currentDocData.name.split(' (v')[0]} (Restaurado desde v${versionToRestore.version})` : currentDocData.name,
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
        updatedAt: serverTimestamp(),
      });

      toast({ title: "Versión Restaurada", description: `El contenido de la versión ${versionToRestore.version} es ahora la versión actual ${newCurrentVersionNumber}.` });
      fetchDocuments();
      setIsVersionHistoryDialogOpen(false);
      await logSystemEvent(currentUser, 'update', 'Document', documentId, `Documento "${docName}" restaurado a versión ${versionToRestore.version}. Nueva versión actual: ${newCurrentVersionNumber}.`);
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

  const renderFutureFeatureCard = (title: string, Icon: LucideIconType, description: string, features: string[], implemented: boolean = false, partiallyImplemented: boolean = false, inProgress: boolean = false) => (
    <Card className={implemented ? "bg-green-50 border-green-200" : (partiallyImplemented || inProgress ? "bg-yellow-50 border-yellow-200" : "bg-muted/30")}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-lg ${implemented ? 'text-green-700' : (partiallyImplemented || inProgress ? 'text-yellow-700' : 'text-amber-500')}`}>
          <Icon className="h-5 w-5" />
          {title}
          {implemented && <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white text-xs">Implementado</Badge>}
          {partiallyImplemented && <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-black text-xs">Parcial</Badge>}
          {inProgress && !implemented && !partiallyImplemented && <Badge variant="outline" className="border-blue-500 text-blue-600 text-xs">En Progreso</Badge>}
          {!implemented && !partiallyImplemented && !inProgress && <Badge variant="outline" className="text-xs">Planeado</Badge>}
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
                Organiza, versiona, comparte y visualiza documentos y plantillas.
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
                {(isLoading || isLoadingSupportData) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
                    </div>
                ) : filteredDocuments.length > 0 && currentUser ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDocuments.map(docFile => (
                        <DocumentListItem
                        key={docFile.id}
                        documentFile={docFile}
                        onDelete={(docId, storagePath) => confirmDeleteDocument(docId, storagePath, docFile.name)}
                        onUploadNewVersion={openUploadNewVersionDialog}
                        onViewHistory={openVersionHistoryDialog}
                        onTogglePublic={(docId, isPub) => handleTogglePublic(docId, isPub, docFile.name)}
                        onUpdateSharingSettings={(docId, perms) => handleUpdateSharingSettings(docId, perms, docFile.name)}
                        onViewDocument={handleViewDocument}
                        leads={leads}
                        contacts={contacts}
                        allUsers={allUsers}
                        currentUser={currentUser}
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
            LinkIconLucideReal,
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
            "Compartir y Visualizar Documentos",
            ShareIconLucide,
            "Comparte y visualiza documentos de forma segura.",
            ["Opción para marcar documento como público/privado (Implementado).", "Copiar enlace público si el documento es público (Implementado).", "Gestión de permisos por usuario (ver/editar) (Implementado).", "Gestión de permisos por grupo (En Desarrollo).", "Visualización en-app de PDFs y archivos de texto (.txt, .md) (Implementado).", "Visualización en-app para DOCX, XLSX (Se abre diálogo con opción de descarga; edición vía nueva versión)."],
            false, true, true
        )}
         {renderFutureFeatureCard(
            "Notificaciones",
            Bell,
            "Recibe alertas sobre actividad en documentos.",
            ["Notificaciones de acceso o cambios en documentos compartidos (Planeado)."],
            false, false, false
        )}
        {renderFutureFeatureCard(
            "Integración con Almacenamiento en la Nube",
            Settings2,
            "Conecta con servicios como Google Drive o Dropbox (Funcionalidad Avanzada).",
            ["Sincronizar documentos desde/hacia almacenamientos externos.", "Autenticación con servicios de terceros."],
            false, false, false
        )}
      </div>

      {documentToDelete && (
        <AlertDialog open={!!documentToDelete} onOpenChange={() => setDocumentToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El documento &quot;{documentToDelete.name}&quot; y todas sus versiones serán eliminados permanentemente del almacenamiento y de la base de datos.
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
          onUploadSuccess={(docName, newVer) => handleUploadNewVersionSuccess(docName, newVer)}
        />
      )}

      {documentForVersionHistory && (
        <VersionHistoryDialog
          isOpen={isVersionHistoryDialogOpen}
          onOpenChange={setIsVersionHistoryDialogOpen}
          documentFile={documentForVersionHistory}
          onRestoreVersion={(docId, version) => handleRestoreVersion(docId, version, documentForVersionHistory.name)}
        />
      )}

      {currentUser && (
         <AddEditDocumentTemplateDialog
            isOpen={isTemplateDialogOpen}
            onOpenChange={setIsTemplateDialogOpen}
            templateToEdit={editingTemplate}
            currentUser={currentUser}
            onSaveSuccess={(tplName, isEdit) => handleSaveTemplateSuccess(tplName, isEdit)}
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
      {documentToView && (
        <DocumentViewerDialog
            isOpen={isDocumentViewerOpen}
            onOpenChange={setIsDocumentViewerOpen}
            documentFile={documentToView}
        />
      )}
    </div>
  );
}
