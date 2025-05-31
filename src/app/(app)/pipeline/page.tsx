"use client";

import { useState, useEffect, useCallback } from "react";
import type { Lead, PipelineStage } from "@/lib/types";
import { INITIAL_PIPELINE_STAGES, NAV_ITEMS } from "@/lib/constants";
import { PipelineStageColumn } from "@/components/pipeline/pipeline-stage-column";
import { AddEditLeadDialog } from "@/components/pipeline/add-edit-lead-dialog";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, query, orderBy, Timestamp, where } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { logSystemEvent } from "@/lib/auditLogger";
import { useSearchParams, useRouter } from "next/navigation";
import { isValid, parseISO } from "date-fns";

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
    if (fieldValue && typeof fieldValue === 'object' && fieldValue.hasOwnProperty('_methodName') && fieldValue._methodName === 'serverTimestamp') {
        return new Date().toISOString(); 
    }
    console.warn("Formato de fecha inesperado en parseDateField para Pipeline:", fieldValue);
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
  const { currentUser } = useAuth(); // Ya lo tienes
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [cookieTenantId, setCookieTenantId] = useState<string | null>(null); // Renombrado para claridad
  const [tenantIdLoaded, setTenantIdLoaded] = useState(false); 

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const idFromCookie = document.cookie.match(/tenantId=([^;]+)/)?.[1] || null;
      setCookieTenantId(idFromCookie);
      setTenantIdLoaded(true); 
      console.log("PipelinePage useEffect (Cookie Reader): Tenant ID leído de la cookie:", idFromCookie);
    }
  }, []);

  // Determinar el tenantId efectivo a usar
  const effectiveTenantId = currentUser?.tenantId || cookieTenantId;

  const fetchLeads = useCallback(async () => {
    // Esperar a que currentUser esté disponible y se haya intentado cargar la cookie.
    // currentUser puede ser undefined inicialmente hasta que el contexto de autenticación se cargue.
    if (currentUser === undefined || !tenantIdLoaded) { 
        // console.log("PipelinePage fetchLeads: Esperando a currentUser y tenantIdLoaded.");
        // setIsLoadingLeads(false); // Opcional: indicar que no se está cargando si se retorna temprano
        return []; 
    }

    setIsLoadingLeads(true);
    console.log("PipelinePage fetchLeads: Usando effectiveTenantId para la consulta:", effectiveTenantId);

    try {
      const leadsCollectionRef = collection(db, "leads");
      let q;
      if (effectiveTenantId) {
        q = query(leadsCollectionRef, where("tenantId", "==", effectiveTenantId), orderBy("createdAt", "desc"));
      } else {
        console.log("PipelinePage fetchLeads: No hay effectiveTenantId (ni de currentUser ni de cookie). No se cargarán leads.");
        setLeads([]);
        setIsLoadingLeads(false);
        return []; 
      }
      
      const querySnapshot = await getDocs(q);
      const fetchedLeads = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: parseDateField(data.createdAt) || new Date().toISOString(),
          expectedCloseDate: parseDateField(data.expectedCloseDate),
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
  }, [currentUser, cookieTenantId, tenantIdLoaded, toast]);

  useEffect(() => {
    setStages(INITIAL_PIPELINE_STAGES.sort((a, b) => a.order - b.order));
    // Solo llamar fetchLeads si currentUser no es undefined (es decir, el contexto de autenticación ha resuelto)
    // y si tenantIdLoaded es true.
    if (currentUser !== undefined && tenantIdLoaded) { 
        fetchLeads().then(fetchedLeads => {
          if (!fetchedLeads) return; 
          const leadIdFromQuery = searchParams.get('leadId');
          if (leadIdFromQuery && fetchedLeads) {
            const leadToOpen = fetchedLeads.find(l => l.id === leadIdFromQuery);
            if (leadToOpen) {
              setEditingLead(leadToOpen);
              setIsLeadDialogOpen(true);
            }
          }
        });
    }
  }, [fetchLeads, searchParams, router, tenantIdLoaded, currentUser]); 

  const handleSaveLead = async (leadData: Lead) => {
    console.log("handleSaveLead: Iniciando guardado de lead...");
    console.log("handleSaveLead: currentUser.tenantId:", currentUser?.tenantId);
    console.log("handleSaveLead: cookieTenantId (del estado/cookie):", cookieTenantId);
    console.log("handleSaveLead: leadData recibida:", JSON.stringify(leadData, null, 2));
    console.log("handleSaveLead: leadData.tenantId (del formulario):", leadData.tenantId);

    if (!currentUser) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }

    let tenantIdToSave: string | null | undefined = leadData.tenantId; // Para edición
    if (!tenantIdToSave) { // Si es nuevo lead o el lead editado no tiene tenantId
        tenantIdToSave = currentUser?.tenantId;
    }
    if (!tenantIdToSave) { // Fallback a la cookie si currentUser no tiene tenantId
        tenantIdToSave = cookieTenantId;
    }
    
    console.log("handleSaveLead: tenantIdToSave determinado:", tenantIdToSave);

    if (!tenantIdToSave) {
      console.error("handleSaveLead: Error - No se pudo determinar un Tenant ID para guardar el lead.");
      toast({ title: "Error Crítico", description: "No se puede guardar el lead. Falta el Tenant ID.", variant: "destructive" });
      return;
    }

    setIsSubmittingLead(true);
    const isEditing = !!leadData.id && leads.some(l => l.id === leadData.id);
    const leadId = leadData.id || doc(collection(db, "leads")).id;

    try {
        const leadDocRef = doc(db, "leads", leadId);
        
        const finalLeadData = {
            ...leadData,
            id: leadId,
            createdAt: leadData.createdAt ? (typeof leadData.createdAt === 'string' ? leadData.createdAt : (leadData.createdAt as unknown as Timestamp).toDate().toISOString()) : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expectedCloseDate: leadData.expectedCloseDate ? (typeof leadData.expectedCloseDate === 'string' ? leadData.expectedCloseDate : (leadData.expectedCloseDate as unknown as Timestamp).toDate().toISOString()) : undefined,
            tenantId: tenantIdToSave, // Usar el tenantId determinado
        };
        
        const dataToSaveForFirestore = {
          ...finalLeadData,
          createdAt: Timestamp.fromDate(new Date(finalLeadData.createdAt)),
          updatedAt: Timestamp.fromDate(new Date(finalLeadData.updatedAt!)),
          expectedCloseDate: finalLeadData.expectedCloseDate ? Timestamp.fromDate(new Date(finalLeadData.expectedCloseDate)) : null,
          // tenantId ya está en finalLeadData y se guardará
        };
        
        await setDoc(leadDocRef, dataToSaveForFirestore, { merge: true });

        fetchLeads();
        toast({
          title: isEditing ? "Lead Actualizado" : "Lead Creado",
          description: `El lead "${leadData.name}" ha sido guardado exitosamente para el tenant ${tenantIdToSave}.`,
        });

        const actionType = isEditing ? 'update' : 'create';
        const actionDetails = isEditing ?
          `Lead "${leadData.name}" actualizado.` :
          `Lead "${leadData.name}" creado.`;
        if (currentUser) { 
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
     if (!effectiveTenantId) { 
      toast({ title: "Acción no permitida", description: "No se puede crear un lead sin un Tenant ID asociado.", variant: "destructive" });
      return;
    }
    setEditingLead(null);
    setIsLeadDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{pipelineNavItem ? pipelineNavItem.label : "Embudo de Ventas"}</h2>
        <Button onClick={openNewLeadDialog} disabled={isSubmittingLead || !tenantIdLoaded || currentUser === undefined}>
          <PlusCircle className="mr-2 h-5 w-5" /> Añadir Lead
        </Button>
      </div>
      
      {/* {tenantIdLoaded && (
         <div className="mb-4 p-2 bg-gray-100 border text-xs">
           Debug Info:<br />
           effectiveTenantId: {effectiveTenantId || "null"} <br />
           currentUser.tenantId: {currentUser?.tenantId || "(currentUser no disponible o sin tenantId)"} <br />
           cookieTenantId: {cookieTenantId || "null"} <br />
           tenantIdLoaded: {tenantIdLoaded ? "true" : "false"} <br />
           currentUser evaluated: {currentUser !== undefined ? "true" : "false"}
         </div>
      )} */}

      {isLoadingLeads && tenantIdLoaded && currentUser !== undefined ? (
         <div className="flex flex-grow items-center justify-center">
           <div className="space-y-2 text-center">
            <Skeleton className="h-8 w-64 mx-auto" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-4 w-48 mx-auto" />
            <p className="text-sm text-muted-foreground">Cargando leads...</p>
           </div>
         </div>
      ) : (!tenantIdLoaded || currentUser === undefined) ? (
        <div className="flex flex-grow items-center justify-center">
            <p className="text-sm text-muted-foreground">Inicializando y esperando datos de usuario...</p>
        </div>
      ) : leads.length === 0 && effectiveTenantId ? (
         <div className="flex flex-grow items-center justify-center">
            <p className="text-lg text-muted-foreground">No hay leads en este embudo para el tenant ({effectiveTenantId}).</p>
        </div>
      ) : leads.length === 0 && !effectiveTenantId && tenantIdLoaded ? (
         <div className="flex flex-grow items-center justify-center">
            <p className="text-lg text-red-500">Error: No se pudo determinar un Tenant ID. No se pueden mostrar leads.</p>
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
