"use client";

import { useState, useEffect, useCallback } from "react";
import type { PipelineStage, Lead } from "@/lib/types";
import { INITIAL_PIPELINE_STAGES, NAV_ITEMS } from "@/lib/constants";
import { PipelineStageColumn } from "@/components/pipeline/pipeline-stage-column";
import { AddEditLeadDialog } from "@/components/pipeline/add-edit-lead-dialog";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);

  const pipelineNavItem = NAV_ITEMS.find(item => item.href === '/pipeline');
  const { toast } = useToast();

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
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          expectedCloseDate: typeof data.expectedCloseDate === 'string' ? data.expectedCloseDate : (data.expectedCloseDate as Timestamp)?.toDate().toISOString() || undefined,
        } as Lead;
      });
      setLeads(fetchedLeads);
    } catch (error) {
      console.error("Error al obtener leads:", error);
      toast({
        title: "Error al Cargar Leads",
        description: "No se pudieron cargar los leads del embudo.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingLeads(false);
    }
  }, [toast]);

  useEffect(() => {
    setStages(INITIAL_PIPELINE_STAGES.sort((a, b) => a.order - b.order));
    fetchLeads();
  }, [fetchLeads]);

  const handleSaveLead = async (leadData: Lead) => {
    setIsSubmittingLead(true);
    const isEditing = !!leadData.id && leads.some(l => l.id === leadData.id);
    const leadId = leadData.id || doc(collection(db, "leads")).id;

    try {
        const leadDocRef = doc(db, "leads", leadId);
        
        const firestoreSafeLead = {
            ...leadData,
            id: leadId, // ensure id is part of the object for local state, but not saved directly in document fields
            createdAt: leadData.createdAt ? Timestamp.fromDate(new Date(leadData.createdAt)) : Timestamp.now(),
            updatedAt: Timestamp.now(),
            expectedCloseDate: leadData.expectedCloseDate ? Timestamp.fromDate(new Date(leadData.expectedCloseDate)) : null,
        };
        
        // Firestore setDoc will use leadId as document ID, so we exclude it from the data payload itself.
        const { id, ...dataToSave } = firestoreSafeLead;

        await setDoc(leadDocRef, dataToSave, { merge: true });
        
        fetchLeads(); 
        toast({
          title: isEditing ? "Lead Actualizado" : "Lead Creado",
          description: `El lead "${leadData.name}" ha sido guardado exitosamente.`,
        });
        setEditingLead(null);
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
  };
  
  const openNewLeadDialog = () => {
    setEditingLead(null); 
    // The dialog will open/close based on its internal `isOpen` state,
    // which is typically controlled by its `trigger` or an explicit `open` prop
    // if we decide to manage it from here. For now, AddEditLeadDialog manages its own open state via trigger.
  };


  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{pipelineNavItem ? pipelineNavItem.label : "Embudo de Ventas"}</h2>
        <AddEditLeadDialog
          trigger={
            <Button onClick={openNewLeadDialog} disabled={isSubmittingLead}>
              <PlusCircle className="mr-2 h-5 w-5" /> Añadir Lead
            </Button>
          }
          stages={stages}
          leadToEdit={editingLead}
          onSave={handleSaveLead}
          isSubmitting={isSubmittingLead}
          key={editingLead ? editingLead.id : "new-lead"} // Ensure dialog re-initializes
        />
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
    </div>
  );
}
