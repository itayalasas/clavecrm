
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
import { collection, getDocs, doc, setDoc, query, orderBy, Timestamp }
from "firebase/firestore";
import { useToast }
from "@/hooks/use-toast";
import { Skeleton }
from "@/components/ui/skeleton";
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

  const fetchLeads = useCallback(async () => {
    setIsLoadingLeads(true);
    try {
      const leadsCollectionRef = collection(db, "leads");
      const q = query(leadsCollectionRef, orderBy("createdAt", "desc"));
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
  }, [toast]);

  useEffect(() => {
    setStages(INITIAL_PIPELINE_STAGES.sort((a, b) => a.order - b.order));
    fetchLeads().then(fetchedLeads => {
      const leadIdFromQuery = searchParams.get('leadId');
      if (leadIdFromQuery && fetchedLeads) {
        const leadToOpen = fetchedLeads.find(l => l.id === leadIdFromQuery);
        if (leadToOpen) {
          setEditingLead(leadToOpen);
          setIsLeadDialogOpen(true);
          // Optional: remove query param after use
          // router.replace('/pipeline', { scroll: false }); 
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

    try {
        const leadDocRef = doc(db, "leads", leadId);
        
        const firestoreSafeLead = {
            ...leadData,
            id: leadId, // ensure id is part of the object for firestore if it's new
            createdAt: leadData.createdAt ? Timestamp.fromDate(new Date(leadData.createdAt)) : Timestamp.now(),
            updatedAt: Timestamp.now(),
            expectedCloseDate: leadData.expectedCloseDate ? Timestamp.fromDate(new Date(leadData.expectedCloseDate)) : null,
        };
        
        const { id, ...dataToSave } = firestoreSafeLead; // Exclude id for setDoc if it's not needed (Firestore auto-generates)
                                                          // However, we are using a pre-generated or existing id, so it's fine to keep it.
                                                          // Let's assume firestoreSafeLead is what we want to save.
        
        await setDoc(leadDocRef, firestoreSafeLead, { merge: true });

        
        fetchLeads(); 
        toast({
          title: isEditing ? "Lead Actualizado" : "Lead Creado",
          description: `El lead "${leadData.name}" ha sido guardado exitosamente.`,
        });

        const actionType = isEditing ? 'update' : 'create';
        const actionDetails = isEditing ? 
          `Lead "${leadData.name}" actualizado.` : 
          `Lead "${leadData.name}" creado.`;
        await logSystemEvent(currentUser, actionType, 'Lead', leadId, actionDetails);

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
          trigger={<span style={{ display: 'none' }} />} // Empty, non-visible trigger
        />
    </div>
  );
}