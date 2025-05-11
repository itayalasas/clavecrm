
"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContactList, EmailCampaign, EmailTemplate } from "@/lib/types";
import { NAV_ITEMS } from "@/lib/constants";
import { Send, Users, FileText as TemplateIcon, BarChart2, PlusCircle, AlertTriangle, Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp } from "firebase/firestore";
import { AddEditContactListDialog } from "@/components/email-campaigns/add-edit-contact-list-dialog";
import { ContactListItem } from "@/components/email-campaigns/contact-list-item";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function EmailCampaignsPage() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email-campaigns');
  const PageIcon = navItem?.icon || Send;

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isLoadingContactLists, setIsLoadingContactLists] = useState(true);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);

  const [isContactListDialogOpen, setIsContactListDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<ContactList | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);


  const { toast } = useToast();

  // Fetch Contact Lists
  const fetchContactLists = useCallback(async () => {
    setIsLoadingContactLists(true);
    try {
      const q = query(collection(db, "contactLists"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedLists = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        } as ContactList;
      });
      setContactLists(fetchedLists);
    } catch (error) {
      console.error("Error fetching contact lists:", error);
      toast({ title: "Error al Cargar Listas", description: "No se pudieron cargar las listas de contactos.", variant: "destructive" });
    } finally {
      setIsLoadingContactLists(false);
    }
  }, [toast]);

  // Fetch Campaigns (Placeholder)
  const fetchCampaigns = useCallback(async () => {
    setIsLoadingCampaigns(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setCampaigns([]); // Replace with actual data fetching
    setIsLoadingCampaigns(false);
  }, []);

  // Fetch Templates (Placeholder)
  const fetchTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setTemplates([]); // Replace with actual data fetching
    setIsLoadingTemplates(false);
  }, []);

  useEffect(() => {
    fetchContactLists();
    fetchCampaigns();
    fetchTemplates();
  }, [fetchContactLists, fetchCampaigns, fetchTemplates]);

  const handleSaveContactList = async (listData: Omit<ContactList, 'id' | 'createdAt'>) => {
    try {
      await addDoc(collection(db, "contactLists"), {
        ...listData,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Lista Creada", description: `La lista "${listData.name}" ha sido creada exitosamente.` });
      fetchContactLists(); // Refresh lists
      return true; // Indicate success
    } catch (error) {
      console.error("Error creating contact list:", error);
      toast({ title: "Error al Crear Lista", description: "Ocurrió un error al guardar la lista.", variant: "destructive" });
      return false; // Indicate failure
    }
  };
  
  const confirmDeleteList = (list: ContactList) => {
    setListToDelete(list);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteContactList = async () => {
    if (!listToDelete) return;
    try {
      await deleteDoc(doc(db, "contactLists", listToDelete.id));
      toast({ title: "Lista Eliminada", description: `La lista "${listToDelete.name}" ha sido eliminada.` });
      fetchContactLists(); // Refresh lists
    } catch (error) {
      console.error("Error deleting contact list:", error);
      toast({ title: "Error al Eliminar Lista", variant: "destructive" });
    } finally {
        setIsDeleteDialogOpen(false);
        setListToDelete(null);
    }
  };


  const renderPlaceHolderContent = (title: string, features: string[]) => (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Construction className="h-5 w-5 text-amber-500" />
          {title} - En Desarrollo
        </CardTitle>
        <CardDescription>Esta sección está planificada y se implementará próximamente.</CardDescription>
      </CardHeader>
      <CardContent>
        <h4 className="font-semibold mb-2">Funcionalidades Planeadas:</h4>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground text-sm">
          {features.map(feature => <li key={feature}>{feature}</li>)}
        </ul>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Campañas de Email Marketing"}
          </CardTitle>
          <CardDescription>
            Gestiona tus campañas de email marketing, segmenta listas, envía correos masivos y utiliza plantillas personalizables.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="contact-lists" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="campaigns">
            <Send className="mr-2 h-4 w-4" /> Campañas
          </TabsTrigger>
          <TabsTrigger value="contact-lists">
            <Users className="mr-2 h-4 w-4" /> Listas de Contactos
          </TabsTrigger>
          <TabsTrigger value="templates">
            <TemplateIcon className="mr-2 h-4 w-4" /> Plantillas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <div className="flex justify-between items-center my-4">
            <h3 className="text-xl font-semibold">Gestión de Campañas</h3>
            <Button disabled> {/* onClick={() => setIsCampaignDialogOpen(true)} */}
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva Campaña
            </Button>
          </div>
          {isLoadingCampaigns ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : campaigns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Map through campaigns here */}
            </div>
          ) : (
             renderPlaceHolderContent("Campañas de Email", [
                "Creación y programación de envíos masivos.",
                "Selección de listas de contactos y plantillas.",
                "Analíticas de rendimiento (aperturas, clics, etc.).",
                "Pruebas A/B para asuntos y contenido.",
             ])
          )}
        </TabsContent>

        <TabsContent value="contact-lists">
          <div className="flex justify-between items-center my-4">
            <h3 className="text-xl font-semibold">Listas de Contactos</h3>
            <AddEditContactListDialog
                trigger={
                    <Button onClick={() => setIsContactListDialogOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Nueva Lista de Contactos
                    </Button>
                }
                isOpen={isContactListDialogOpen}
                onOpenChange={setIsContactListDialogOpen}
                onSave={handleSaveContactList}
            />
          </div>
          {isLoadingContactLists ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : contactLists.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contactLists.map(list => (
                <ContactListItem key={list.id} list={list} onDelete={() => confirmDeleteList(list)} />
              ))}
            </div>
          ) : (
            <Card className="mt-6 col-span-full">
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium">No hay listas de contactos todavía.</p>
                <p>Crea tu primera lista para empezar a organizar tus contactos.</p>
                 <AddEditContactListDialog
                    trigger={
                        <Button className="mt-4">
                            <PlusCircle className="mr-2 h-4 w-4" /> Crear Lista
                        </Button>
                    }
                    isOpen={isContactListDialogOpen}
                    onOpenChange={setIsContactListDialogOpen}
                    onSave={handleSaveContactList}
                />
              </CardContent>
            </Card>
          )}
           {renderPlaceHolderContent("Gestión Avanzada de Contactos y Segmentación", [
                "Importación y exportación de contactos (CSV).",
                "Gestión individual de contactos (añadir, editar, eliminar).",
                "Segmentación basada en etiquetas, actividad o campos personalizados.",
                "Formularios de suscripción/desuscripción.",
            ])}
        </TabsContent>

        <TabsContent value="templates">
           <div className="flex justify-between items-center my-4">
            <h3 className="text-xl font-semibold">Plantillas de Correo</h3>
            <Button disabled> {/* onClick={() => setIsTemplateDialogOpen(true)} */}
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva Plantilla
            </Button>
          </div>
          {isLoadingTemplates ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Map through templates here */}
            </div>
          ) : (
             renderPlaceHolderContent("Editor de Plantillas de Correo", [
                "Editor visual (arrastrar y soltar) de plantillas.",
                "Opción para importar/editar HTML directamente.",
                "Biblioteca de plantillas pre-diseñadas.",
                "Personalización con variables (ej. {{nombre_contacto}}).",
                "Previsualización en escritorio y móvil.",
             ])
          )}
        </TabsContent>
      </Tabs>
      
        {listToDelete && (
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción no se puede deshacer. Esto eliminará permanentemente la lista de contactos &quot;{listToDelete.name}&quot; 
                    y podría afectar a las campañas que la utilicen. Los contactos individuales no serán eliminados de la base de datos general, solo la asociación a esta lista.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setListToDelete(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteContactList} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Sí, eliminar lista
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
        )}
    </div>
  );
}