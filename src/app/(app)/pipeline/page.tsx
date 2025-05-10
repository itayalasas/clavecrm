"use client";

import { useState, useEffect } from "react";
import type { PipelineStage, Lead } from "@/lib/types";
import { INITIAL_PIPELINE_STAGES, INITIAL_LEADS, NAV_ITEMS } from "@/lib/constants";
import { PipelineStageColumn } from "@/components/pipeline/pipeline-stage-column";
import { AddEditLeadDialog } from "@/components/pipeline/add-edit-lead-dialog";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  const pipelineNavItem = NAV_ITEMS.find(item => item.href === '/pipeline');


  useEffect(() => {
    // Simulate fetching data
    setStages(INITIAL_PIPELINE_STAGES.sort((a, b) => a.order - b.order));
    setLeads(INITIAL_LEADS);
  }, []);

  const handleSaveLead = (lead: Lead) => {
    setLeads(prevLeads => {
      const existingLeadIndex = prevLeads.findIndex(l => l.id === lead.id);
      if (existingLeadIndex > -1) {
        const updatedLeads = [...prevLeads];
        updatedLeads[existingLeadIndex] = lead;
        return updatedLeads;
      }
      return [...prevLeads, lead];
    });
    setEditingLead(null); // Close dialog by resetting editingLead
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    // Dialog will open via its own state when trigger is clicked and editingLead is set
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)]"> {/* Adjust height considering header and padding */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">{pipelineNavItem ? pipelineNavItem.label : "Embudo de Ventas"}</h2>
        <AddEditLeadDialog
          trigger={
            <Button>
              <PlusCircle className="mr-2 h-5 w-5" /> Añadir Lead
            </Button>
          }
          stages={stages}
          leadToEdit={editingLead}
          onSave={handleSaveLead}
        />
      </div>
      
      {/* This button is a bit redundant if AddEditLeadDialog is opened by setting editingLead. 
          Kept for explicitness if AddEditLeadDialog has its own open state.
          If AddEditLeadDialog's open state is tied to editingLead, this button could set editingLead to an empty lead object.
      */}
      {editingLead && (
         <AddEditLeadDialog
          trigger={<span className="hidden" />} // Hidden trigger, dialog opened programmatically
          stages={stages}
          leadToEdit={editingLead}
          onSave={handleSaveLead}
        />
      )}

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
    </div>
  );
}
