
"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContactList, EmailCampaign, EmailTemplate, Contact } from "@/lib/types";
import { NAV_ITEMS, EMAIL_CAMPAIGN_STATUSES } from "@/lib/constants";
import { Send, Users, FileText as TemplateIcon, PlusCircle, Construction, Import, SlidersHorizontal as Sliders, FileSignature, LucideIcon, Palette, ListChecks, BarChart2, TestTube2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp, setDoc, where } from "firebase/firestore";
import { AddEditContactListDialog } from "@/components/email-campaigns/add-edit-contact-list-dialog";
import { ContactListItem } from "@/components/email-campaigns/contact-list-item";
import { ManageContactsDialog } from "@/components/email-campaigns/manage-contacts-dialog";
import { AddEditEmailTemplateDialog } from "@/components/email-campaigns/add-edit-email-template-dialog";
import { EmailTemplateItem } from "@/components/email-campaigns/email-template-item";
import { AddEditEmailCampaignDialog } from "@/components/email-campaigns/add-edit-email-campaign-dialog";
import { PreviewEmailTemplateDialog } from "@/components/email-campaigns/preview-email-template-dialog";
import { EmailCampaignItem } from "@/components/email-campaigns/email-campaign-item";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function EmailCampaignsPage() {
  const navItem = NAV_ITEMS.find(item => item.href === '/email-campaigns');
  const PageIcon = navItem?.icon || Send;

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]); 

  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isLoadingContactLists, setIsLoadingContactLists] = useState(true);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);

  const [isContactListDialogOpen, setIsContactListDialogOpen] = useState(false);
  const [isManageContactsDialogOpen, setIsManageContactsDialogOpen] = useState(false);
  const [selectedListForContacts, setSelectedListForContacts] = useState<ContactList | null>(null);
  const [listToDelete, setListToDelete] = useState<ContactList | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
  const [isDeleteTemplateDialogOpen, setIsDeleteTemplateDialogOpen] = useState(false);
  const [isPreviewTemplateDialogOpen, setIsPreviewTemplateDialogOpen] = useState(false);
  const [templateToPreview, setTemplateToPreview] = useState<EmailTemplate | null>(null);


  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaign | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<EmailCampaign | null>(null);
  const [isDeleteCampaignDialogOpen, setIsDeleteCampaignDialogOpen] = useState(false);

  const { toast } = useToast();

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
          contactCount: data.contactCount || 0,
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        } as ContactList;
      });
      setContactLists(fetchedLists);
    } catch (error) {
      console.error("Error al obtener listas de contactos:", error);
      toast({ title: "Error al Cargar Listas", description: "No se pudieron cargar las listas de contactos.", variant: "destructive" });
    } finally {
      setIsLoadingContactLists(false);
    }
  }, [toast]);

  const fetchAllContacts = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
        const q = query(collection(db, "contacts"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const fetchedContacts = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
            } as Contact;
        });
        setContacts(fetchedContacts);
    } catch (error) {
        console.error("Error al obtener todos los contactos:", error);
        toast({ title: "Error al Cargar Contactos", description: "No se pudieron cargar los contactos generales.", variant: "destructive" });
    } finally {
        setIsLoadingContacts(false);
    }
  }, [toast]);

  const fetchTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const q = query(collection(db, "emailTemplates"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedTemplates = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: (docSnap.data().createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: (docSnap.data().updatedAt as Timestamp)?.toDate().toISOString() || undefined,
      } as EmailTemplate));
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error("Error al obtener plantillas:", error);
      toast({ title: "Error al Cargar Plantillas", variant: "destructive" });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [toast]);
  
  const fetchCampaigns = useCallback(async () => {
    setIsLoadingCampaigns(true);
    try {
      const q = query(collection(db, "emailCampaigns"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedCampaigns = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
        id: docSnap.id,
        ...data,
        createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString() || undefined,
        scheduledAt: (data.scheduledAt as Timestamp)?.toDate().toISOString() || undefined,
        sentAt: (data.sentAt as Timestamp)?.toDate().toISOString() || undefined,
      } as EmailCampaign});
      setCampaigns(fetchedCampaigns);
    } catch (error) {
      console.error("Error al obtener campañas:", error);
      toast({ title: "Error al Cargar Campañas", variant: "destructive" });
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchContactLists();
    fetchAllContacts();
    fetchTemplates();
    fetchCampaigns();
  }, [fetchContactLists, fetchAllContacts, fetchTemplates, fetchCampaigns]);

  const handleSaveContactList = async (listData: Omit<ContactList, 'id' | 'createdAt' | 'contactCount'>) => {
    try {
      await addDoc(collection(db, "contactLists"), {
        ...listData,
        contactCount: 0,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Lista Creada", description: `La lista "${listData.name}" ha sido creada exitosamente.` });
      fetchContactLists();
      return true;
    } catch (error) {
      console.error("Error al crear lista de contactos:", error);
      toast({ title: "Error al Crear Lista", variant: "destructive" });
      return false;
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
      fetchContactLists();
    } catch (error) {
      console.error("Error al eliminar lista de contactos:", error);
      toast({ title: "Error al Eliminar Lista", variant: "destructive" });
    } finally {
        setIsDeleteDialogOpen(false);
        setListToDelete(null);
    }
  };

  const handleOpenManageContacts = (list: ContactList) => {
    setSelectedListForContacts(list);
    setIsManageContactsDialogOpen(true);
  };

  const handleSaveTemplate = async (templateData: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    try {
      const docRefId = id || doc(collection(db, "emailTemplates")).id;
      await setDoc(doc(db, "emailTemplates", docRefId), {
        ...templateData,
        [id ? 'updatedAt' : 'createdAt']: serverTimestamp(),
      }, { merge: !!id });
      toast({ title: id ? "Plantilla Actualizada" : "Plantilla Creada", description: `Plantilla "${templateData.name}" guardada.` });
      fetchTemplates();
      return true;
    } catch (error) {
      console.error("Error al guardar plantilla:", error);
      toast({ title: "Error al Guardar Plantilla", variant: "destructive" });
      return false;
    }
  };

  const confirmDeleteTemplate = (template: EmailTemplate) => {
    setTemplateToDelete(template);
    setIsDeleteTemplateDialogOpen(true);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      await deleteDoc(doc(db, "emailTemplates", templateToDelete.id));
      toast({ title: "Plantilla Eliminada", description: `La plantilla "${templateToDelete.name}" fue eliminada.` });
      fetchTemplates();
    } catch (error) {
      console.error("Error al eliminar plantilla:", error);
      toast({ title: "Error al Eliminar Plantilla", variant: "destructive" });
    } finally {
      setIsDeleteTemplateDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const handlePreviewTemplate = (template: EmailTemplate) => {
    setTemplateToPreview(template);
    setIsPreviewTemplateDialogOpen(true);
  };

  const handleSaveCampaign = async (campaignData: Omit<EmailCampaign, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'analytics' | 'sentAt'>, id?: string) => {
    try {
      const docRefId = id || doc(collection(db, "emailCampaigns")).id;
      const existingCampaign = id ? campaigns.find(c => c.id === id) : null;
      
      const dataToSave: any = {
        ...campaignData,
        status: existingCampaign?.status || EMAIL_CAMPAIGN_STATUSES[0], 
        analytics: existingCampaign?.analytics || {},
        [id ? 'updatedAt' : 'createdAt']: serverTimestamp(),
      };

      // Ensure sentAt is either a Timestamp or null, not undefined
      if (campaignData.scheduledAt && (dataToSave.status === 'Enviada' || dataToSave.status === 'Enviando')) {
         dataToSave.sentAt = existingCampaign?.sentAt ? Timestamp.fromDate(new Date(existingCampaign.sentAt)) : Timestamp.fromDate(new Date(campaignData.scheduledAt));
      } else if (existingCampaign?.sentAt) {
         dataToSave.sentAt = Timestamp.fromDate(new Date(existingCampaign.sentAt));
      }
      else {
        dataToSave.sentAt = null; // Explicitly set to null if not sending now/previously sent
      }
      
      if (campaignData.scheduledAt) {
        dataToSave.scheduledAt = Timestamp.fromDate(new Date(campaignData.scheduledAt));
      } else {
        dataToSave.scheduledAt = null;
      }


      await setDoc(doc(db, "emailCampaigns", docRefId), dataToSave, { merge: true });
      toast({ title: id ? "Campaña Actualizada" : "Campaña Creada", description: `Campaña "${campaignData.name}" guardada.` });
      fetchCampaigns();
      return true;
    } catch (error) {
      console.error("Error al guardar campaña:", error);
      toast({ title: "Error al Guardar Campaña", variant: "destructive" });
      return false;
    }
  };

  const confirmDeleteCampaign = (campaign: EmailCampaign) => {
    setCampaignToDelete(campaign);
    setIsDeleteCampaignDialogOpen(true);
  };

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    try {
      await deleteDoc(doc(db, "emailCampaigns", campaignToDelete.id));
      toast({ title: "Campaña Eliminada", description: `La campaña "${campaignToDelete.name}" fue eliminada.` });
      fetchCampaigns();
    } catch (error) {
      console.error("Error al eliminar campaña:", error);
      toast({ title: "Error al Eliminar Campaña", variant: "destructive" });
    } finally {
      setIsDeleteCampaignDialogOpen(false);
      setCampaignToDelete(null);
    }
  };

  const renderPlaceHolderContent = (title: string, features: string[], Icon?: LucideIcon, implemented: boolean = false) => (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {Icon ? <Icon className={`h-5 w-5 ${implemented ? 'text-green-500' : 'text-primary'}`} /> : <Construction className="h-5 w-5 text-amber-500" />}
          {title}
        </CardTitle>
        <CardDescription>{implemented ? "Funcionalidad parcialmente implementada." : "Esta sección está planificada y se implementará próximamente."}</CardDescription>
      </CardHeader>
      <CardContent>
        <h4 className="font-semibold mb-2">Funcionalidades {implemented ? 'Actuales/Planeadas' : 'Planeadas'}:</h4>
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

      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="campaigns">
            <Send className="mr-2 h-4 w-4" /> Campañas
          </TabsTrigger>
          <TabsTrigger value="contact-lists">
            <Users className="mr-2 h-4 w-4" /> Listas y Contactos
          </TabsTrigger>
          <TabsTrigger value="templates">
            <TemplateIcon className="mr-2 h-4 w-4" /> Plantillas
          </TabsTrigger>
        </TabsList>

        {/* CAMPAIGNS TAB */}
        <TabsContent value="campaigns">
          <div className="flex justify-between items-center my-4">
            <h3 className="text-xl font-semibold">Gestión de Campañas</h3>
             <AddEditEmailCampaignDialog
              trigger={
                <Button onClick={() => { setEditingCampaign(null); setIsCampaignDialogOpen(true); }}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Nueva Campaña
                </Button>
              }
              isOpen={isCampaignDialogOpen}
              onOpenChange={setIsCampaignDialogOpen}
              onSave={handleSaveCampaign}
              campaignToEdit={editingCampaign}
              contactLists={contactLists}
              emailTemplates={templates}
            />
          </div>
          {isLoadingCampaigns ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
            </div>
          ) : campaigns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map(campaign => (
                <EmailCampaignItem 
                  key={campaign.id} 
                  campaign={campaign} 
                  onEdit={() => { setEditingCampaign(campaign); setIsCampaignDialogOpen(true); }}
                  onDelete={() => confirmDeleteCampaign(campaign)} 
                />
              ))}
            </div>
          ) : (
             <Card className="mt-6 col-span-full">
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Send className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium">No hay campañas todavía.</p>
                <p>Crea tu primera campaña para comunicarte con tus contactos.</p>
                 <AddEditEmailCampaignDialog
                    trigger={
                        <Button className="mt-4" onClick={() => { setEditingCampaign(null); setIsCampaignDialogOpen(true); }}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Crear Campaña
                        </Button>
                    }
                    isOpen={isCampaignDialogOpen}
                    onOpenChange={setIsCampaignDialogOpen}
                    onSave={handleSaveCampaign}
                    campaignToEdit={editingCampaign}
                    contactLists={contactLists}
                    emailTemplates={templates}
                />
              </CardContent>
            </Card>
          )}
           {renderPlaceHolderContent("Funciones Avanzadas de Campaña", [
                "Creación y programación de envíos (Implementado, mejora con hora).",
                "Selección de listas de contactos y plantillas (Implementado).",
                "Analíticas de rendimiento (aperturas, clics, etc.) (Próximamente).",
                "Pruebas A/B para asuntos y contenido (Próximamente).",
            ], Send, true)}
        </TabsContent>

        {/* CONTACT LISTS TAB */}
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
                <ContactListItem 
                  key={list.id} 
                  list={list} 
                  onDelete={() => confirmDeleteList(list)} 
                  onManageContacts={() => handleOpenManageContacts(list)}
                />
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
                        <Button className="mt-4" onClick={() => setIsContactListDialogOpen(true)}>
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
           <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
             {renderPlaceHolderContent("Importar/Exportar", ["Importación y exportación de contactos (CSV) (Próximamente)."], Import, false)}
             {renderPlaceHolderContent("Segmentación y Gestión", ["Gestión individual de contactos (Implementado parcialmente).", "Segmentación basada en etiquetas, actividad o campos personalizados (Próximamente)."], Sliders, true)}
             {renderPlaceHolderContent("Formularios Suscripción", ["Formularios de suscripción/desuscripción (Próximamente)."], FileSignature, false)}
           </div>
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates">
           <div className="flex justify-between items-center my-4">
            <h3 className="text-xl font-semibold">Plantillas de Correo</h3>
             <AddEditEmailTemplateDialog
                trigger={
                    <Button onClick={() => { setEditingTemplate(null); setIsTemplateDialogOpen(true); }}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Nueva Plantilla
                    </Button>
                }
                isOpen={isTemplateDialogOpen}
                onOpenChange={setIsTemplateDialogOpen}
                onSave={handleSaveTemplate}
                templateToEdit={editingTemplate}
            />
          </div>
          {isLoadingTemplates ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(template => (
                <EmailTemplateItem 
                    key={template.id} 
                    template={template} 
                    onEdit={() => { setEditingTemplate(template); setIsTemplateDialogOpen(true); }}
                    onDelete={() => confirmDeleteTemplate(template)}
                    onPreview={handlePreviewTemplate}
                />
              ))}
            </div>
          ) : (
             <Card className="mt-6 col-span-full">
                <CardContent className="pt-6 text-center text-muted-foreground">
                    <TemplateIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium">No hay plantillas todavía.</p>
                    <p>Crea tu primera plantilla para agilizar tus envíos de correo.</p>
                    <AddEditEmailTemplateDialog
                        trigger={
                            <Button className="mt-4" onClick={() => { setEditingTemplate(null); setIsTemplateDialogOpen(true); }}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Crear Plantilla
                            </Button>
                        }
                        isOpen={isTemplateDialogOpen}
                        onOpenChange={setIsTemplateDialogOpen}
                        onSave={handleSaveTemplate}
                        templateToEdit={editingTemplate}
                    />
                </CardContent>
             </Card>
          )}
          {renderPlaceHolderContent("Editor Avanzado y Previsualización", [
                "Editor visual (arrastrar y soltar) (Próximamente).",
                "Opción para importar/editar HTML directamente (Implementado).",
                "Biblioteca de plantillas pre-diseñadas (Implementado parcialmente).",
                "Personalización con variables (ej. {{nombre_contacto}}) (Implementado).",
                "Previsualización en escritorio y móvil (Implementado).",
             ], Palette, true)}
        </TabsContent>
      </Tabs>
      
      {/* Dialogs for Deletion Confirmation */}
      {listToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                  Esta acción no se puede deshacer. Esto eliminará permanentemente la lista de contactos &quot;{listToDelete.name}&quot;. 
                  Los contactos asociados no serán eliminados de la base de datos general, solo la asociación a esta lista.
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

       {templateToDelete && (
        <AlertDialog open={isDeleteTemplateDialogOpen} onOpenChange={setIsDeleteTemplateDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar Plantilla?</AlertDialogTitle>
              <AlertDialogDescription>
                  Esto eliminará permanentemente la plantilla &quot;{templateToDelete.name}&quot;. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTemplateToDelete(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {campaignToDelete && (
        <AlertDialog open={isDeleteCampaignDialogOpen} onOpenChange={setIsDeleteCampaignDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar Campaña?</AlertDialogTitle>
              <AlertDialogDescription>
                  Esto eliminará permanentemente la campaña &quot;{campaignToDelete.name}&quot;. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCampaignToDelete(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCampaign} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Manage Contacts Dialog */}
      {selectedListForContacts && (
        <ManageContactsDialog
            isOpen={isManageContactsDialogOpen}
            onOpenChange={setIsManageContactsDialogOpen}
            list={selectedListForContacts}
            allContacts={contacts} 
            onContactsUpdated={() => { fetchAllContacts(); fetchContactLists(); }} 
        />
      )}
       {/* Preview Template Dialog */}
      <PreviewEmailTemplateDialog
        template={templateToPreview}
        isOpen={isPreviewTemplateDialogOpen}
        onOpenChange={setIsPreviewTemplateDialogOpen}
      />
    </div>
  );
}

    
