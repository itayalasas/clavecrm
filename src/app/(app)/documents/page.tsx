"use client";

import { useState, useEffect, useCallback } from "react";
import type { DocumentFile, Lead, Contact, Order, Quote, Ticket, LucideIcon as LucideIconType } from "@/lib/types";
import { NAV_ITEMS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderKanban, PlusCircle, Search, Filter, Settings2, Share, GitBranch, Info, History, FileSignature, Link as LinkIconLucide } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db, storage } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp, where } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { DocumentListItem } from "@/components/documents/document-list-item";
import { DocumentUploadForm } from "@/components/documents/document-upload-form"; 
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
          ...data,
          uploadedAt: (data.uploadedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          lastVersionUploadedAt: (data.lastVersionUploadedAt as Timestamp)?.toDate().toISOString() || undefined,
          versionHistory: data.versionHistory?.map((v: any) => ({
            ...v,
            uploadedAt: (v.uploadedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          })) || [],
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
    fetchDocuments(); // Refresh the list after a successful upload
    setIsUploadFormVisible(false); // Optionally hide form after upload
  };

  const confirmDeleteDocument = (docId: string, storagePath: string) => {
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


  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.description && doc.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
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
            ["Estructura básica para versionamiento implementada (v1 inicial).", "Subir nueva versión de un documento existente (Pendiente).", "Ver historial de versiones (Pendiente).", "Restaurar versión anterior (Pendiente)."],
            false, // Not fully implemented
            true // Partially implemented
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
                Si existen múltiples versiones, todas serán eliminadas (funcionalidad de borrado de versiones pendiente).
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
    </div>
  );
}
