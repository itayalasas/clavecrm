
"use client";

import { useState, useEffect, useCallback }
from "react";
import type { Lead, PipelineStage }
from "@/lib/types";
import { INITIAL_PIPELINE_STAGES, NAV_ITEMS }
from "@/lib/constants";
import { PipelineStageColumn }
from "@/components/pipeline/pipeline-stage-column";
import { AddEditLeadDialog }
from "@/components/pipeline/add-edit-lead-dialog";
import { Button }
from "@/components/ui/button";
import { PlusCircle }
from "lucide-react";
import { ScrollArea, ScrollBar }
from "@/components/ui/scroll-area";
import { db }
from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, query, orderBy, Timestamp, where } // Added where
from "firebase/firestore";
import { useToast }
from "@/hooks/use-toast";
import { Skeleton }
from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { logSystemEvent } from "@/lib/auditLogger";
import { useSearchParams, useRouter } from "next/navigation"; 
import { isValid, parseISO } from "date-fns";
import { headers } from 'next/headers'; // Import headers

const parseDateField = (fieldValue: any): string | undefined => {
    if (!fieldValue) return undefined;
    if (fieldValue instanceof Timestamp) { 
        return fieldValue.toDate().toISOString();
    }
    if (typeof fieldValue === 'string') {
        const parsedDate = parseISO(fieldValue);
        if (isValid(parsedDate)) {
            return parsedDate.toISOString();
        }
    }
    // Handle cases where it might be a Firestore serverTimestamp pending write (less likely for reads)
    if (fieldValue && typeof fieldValue === 'object' && fieldValue.hasOwnProperty('_methodName') && fieldValue._methodName === 'serverTimestamp') {
        return new Date().toISOString(); // Or handle as "Pending"
    }
    console.warn("Formato de fecha inesperado en parseDateField para Pipeline:", fieldValue);
    // Fallback if it's already a string that's not ISO but might be usable by new Date()
    if (typeof fieldValue === 'string') {
        const parsed = new Date(fieldValue);
        if (isValid(parsed)) return parsed.toISOString();
    }
    return undefined; 
};


export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false); 

  const pipelineNavItem = NAV_ITEMS.find(item => item.href === '/pipeline');
  const { toast } = useToast();
  const { currentUser } = useAuth(); 
  const searchParams = useSearchParams(); 
  const router = useRouter(); 
  const headerList = typeof window === 'undefined' ? headers() : null; // Get headers only on server
  const tenantId = headerList?.get('x-tenant-id');

  useEffect(() => {
    if (typeof window === 'undefined' && headerList) {
      const currentTenantId = headerList.get('x-tenant-id');
      console.log("PipelinePage (Server Component Context): Tenant ID from headers:", currentTenantId);
      // Aquí podrías pasar tenantId como prop a un componente cliente si fuera necesario,
      // o usarlo directamente en fetchLeads si PipelinePage fuera un Server Component que hace fetch.
      // Como es un Client Component, este log es más para demostrar la lectura en el servidor.
    }
  }, [headerList]);

  const fetchLeads = useCallback(async () => {
    setIsLoadingLeads(true);
    // En un componente cliente, no podemos usar headers() directamente para el fetch.
    // El tenantId necesitaría ser obtenido de otra manera (e.g., context, prop, o una API route que lo lea).
    // Para esta demostración, simularemos que lo tenemos.
    // En una app real, este tenantId vendría de un AuthContext o similar que lo obtiene en el cliente
    // (posiblemente de un cookie seteado por el middleware, o de props pasadas por un server component padre).
    const currentTenantId = tenantId || (typeof window !== 'undefined' ? (document.cookie.match(/tenantId=([^;]+)/)?.[1] || null) : null);
    console.log("PipelinePage (Client Component fetchLeads): Tenant ID being used for query:", currentTenantId);

    try {
      const leadsCollectionRef = collection(db, "leads");
      let q;
      if (currentTenantId) {
        // EJEMPLO: Así filtrarías por tenantId si el campo existiera en tus documentos de leads
        // q = query(leadsCollectionRef, where("tenantId", "==", currentTenantId), orderBy("createdAt", "desc"));
        // Por ahora, como no tenemos tenantId en todos los leads, seguimos mostrando todos:
        console.warn(`PipelinePage: Tenant ID '${currentTenantId}' detectado, pero la consulta aún no filtra por tenantId. Mostrando todos los leads.`);
        q = query(leadsCollectionRef, orderBy("createdAt", "desc"));
      } else {
        console.log("PipelinePage: No Tenant ID detectado. Mostrando todos los leads (o según lógica de acceso sin tenant).");
        q = query(leadsCollectionRef, orderBy("createdAt", "desc"));
      }
      
      const querySnapshot = await getDocs(q);
      const fetchedLeads = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: parseDateField(data.createdAt) || new Date().toISOString(),
          expectedCloseDate: parseDateField(data.expectedCloseDate),
          // tenantId: data.tenantId || undefined, // Asegúrate de que los leads tengan este campo
        } as Lead;
      });
      setLeads(fetchedLeads);
      return fetchedLeads; 
    } catch (error) {
      console.error("Error al obtener leads:", error);
      toast({
        title: "Error al Cargar Leads",
        description: "No se pudieron cargar los leads del embudo.",
        variant: "destructive",
      });
      return []; 
    } finally {
      setIsLoadingLeads(false);
    }
  }, [toast, tenantId]); // Añadir tenantId a las dependencias si lo usas directamente para el fetch

  useEffect(() => {
    setStages(INITIAL_PIPELINE_STAGES.sort((a, b) => a.order - b.order));
    fetchLeads().then(fetchedLeads => {
      const leadIdFromQuery = searchParams.get('leadId');
      if (leadIdFromQuery && fetchedLeads) {
        const leadToOpen = fetchedLeads.find(l => l.id === leadIdFromQuery);
        if (leadToOpen) {
          setEditingLead(leadToOpen);
          setIsLeadDialogOpen(true);
        }
      }
    });
  }, [fetchLeads, searchParams, router]);

  const handleSaveLead = async (leadData: Lead) => {
    if (!currentUser) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }
    setIsSubmittingLead(true);
    const isEditing = !!leadData.id && leads.some(l => l.id === leadData.id);
    const leadId = leadData.id || doc(collection(db, "leads")).id;

    // Aquí también, el tenantId debería ser obtenido de una fuente confiable en el cliente
    const currentTenantId = tenantId || (typeof window !== 'undefined' ? (document.cookie.match(/tenantId=([^;]+)/)?.[1] || null) : null);

    try {
        const leadDocRef = doc(db, "leads", leadId);
        
        const firestoreSafeLead: Lead = {
            ...leadData,
            id: leadId,
            createdAt: leadData.createdAt ? leadData.createdAt : new Date().toISOString(), // Ensure createdAt is ISO string
            updatedAt: new Date().toISOString(), // Ensure updatedAt is ISO string
            expectedCloseDate: leadData.expectedCloseDate ? leadData.expectedCloseDate : undefined, // Ensure it's ISO string or undefined
            tenantId: leadData.tenantId || currentTenantId || undefined, // Añadir tenantId al guardar
        };
        
        // Convertir fechas a Timestamps para Firestore
        const dataToSaveForFirestore = {
          ...firestoreSafeLead,
          createdAt: Timestamp.fromDate(new Date(firestoreSafeLead.createdAt)),
          updatedAt: Timestamp.fromDate(new Date(firestoreSafeLead.updatedAt!)),
          expectedCloseDate: firestoreSafeLead.expectedCloseDate ? Timestamp.fromDate(new Date(firestoreSafeLead.expectedCloseDate)) : null,
        };
        
        await setDoc(leadDocRef, dataToSaveForFirestore, { merge: true });

        fetchLeads(); 
        toast({
          title: isEditing ? "Lead Actualizado" : "Lead Creado",
          description: `El lead "${leadData.name}" ha sido guardado exitosamente${currentTenantId ? ` para el tenant ${currentTenantId}` : ''}.`,
        });

        const actionType = isEditing ? 'update' : 'create';
        const actionDetails = isEditing ? 
          `Lead "${leadData.name}" actualizado.` : 
          `Lead "${leadData.name}" creado.`;
        if (currentUser) { // currentUser should not be null here based on earlier check
          await logSystemEvent(currentUser, actionType, 'Lead', leadId, actionDetails);
        }
        
        setEditingLead(null);
        setIsLeadDialogOpen(false); 
    } catch (error) {
        console.error("Error al guardar lead:", error);
        toast({
          title: "Error al Guardar Lead",
          description: "Ocurrió un error al guardar el lead.",
          variant: "destructive",
        });
    } finally {
        setIsSubmittingLead(false);
    }
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setIsLeadDialogOpen(true); 
  };
  
  const openNewLeadDialog = () => {
    setEditingLead(null); 
    setIsLeadDialogOpen(true); 
  };


  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{pipelineNavItem ? pipelineNavItem.label : "Embudo de Ventas"}</h2>
        <Button onClick={openNewLeadDialog} disabled={isSubmittingLead}>
          <PlusCircle className="mr-2 h-5 w-5" /> Añadir Lead
        </Button>
      </div>
      {typeof window !== 'undefined' && tenantId && ( // Mostrar solo en el cliente para depuración
        <div className="mb-4 p-2 bg-blue-100 border border-blue-300 text-blue-700 rounded-md text-sm">
          Tenant ID actual (desde header): {tenantId}
        </div>
      )}
      
      {isLoadingLeads ? (
         <div className="flex flex-grow items-center justify-center">
           <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-4 w-48" />
           </div>
         </div>
      ) : (
        <ScrollArea className="flex-grow pb-4">
          <div className="flex gap-4 h-full">
            {stages.map((stage) => (
              <PipelineStageColumn
                key={stage.id}
                stage={stage}
                leads={leads.filter((lead) => lead.stageId === stage.id)}
                onEditLead={handleEditLead}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
      <AddEditLeadDialog
          isOpen={isLeadDialogOpen} 
          onOpenChange={setIsLeadDialogOpen} 
          stages={stages}
          leadToEdit={editingLead}
          onSave={handleSaveLead}
          isSubmitting={isSubmittingLead}
          trigger={<span style={{ display: 'none' }} />} 
        />
    </div>
  );
}
