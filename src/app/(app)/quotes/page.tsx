"use client";

import { useState, useEffect } from "react";
import type { Quote, Lead, User } from "@/lib/types";
import { NAV_ITEMS, QUOTE_STATUSES, INITIAL_LEADS, INITIAL_USERS } from "@/lib/constants"; // Using initial data for now
import { AddEditQuoteDialog } from "@/components/quotes/add-edit-quote-dialog";
import { QuoteListItem } from "@/components/quotes/quote-list-item";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
// import { db } from "@/lib/firebase";
// import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS); // Placeholder
  const [users, setUsers] = useState<User[]>(INITIAL_USERS); // Placeholder

  const [isLoading, setIsLoading] = useState(false); // Will be true when fetching
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"Todos" | Quote['status']>("Todos");

  const quotesNavItem = NAV_ITEMS.find(item => item.href === '/quotes');
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // TODO: Implement Firestore fetching for quotes, leads, users
  // For now, using mock data

  const handleSaveQuote = async (quoteData: Quote) => {
    // TODO: Save to Firestore
    const isEditing = quotes.some(q => q.id === quoteData.id);
    if (isEditing) {
      setQuotes(prevQuotes => prevQuotes.map(q => q.id === quoteData.id ? quoteData : q));
    } else {
      setQuotes(prevQuotes => [{...quoteData, id: `quote-${Date.now()}`}, ...prevQuotes]);
    }
    toast({
      title: isEditing ? "Cotización Actualizada" : "Cotización Creada",
      description: `La cotización "${quoteData.quoteNumber}" ha sido ${isEditing ? 'actualizada' : 'creada'}.`,
    });
    setEditingQuote(null);
    setIsQuoteDialogOpen(false);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    // TODO: Delete from Firestore
    if (window.confirm("¿Estás seguro de que quieres eliminar esta cotización?")) {
      setQuotes(prevQuotes => prevQuotes.filter(q => q.id !== quoteId));
      toast({
        title: "Cotización Eliminada",
        variant: "destructive",
      });
    }
  };

  const openNewQuoteDialog = () => {
    setEditingQuote(null);
    setIsQuoteDialogOpen(true);
  };

  const openEditQuoteDialog = (quote: Quote) => {
    setEditingQuote(quote);
    setIsQuoteDialogOpen(true);
  };

  const filteredQuotes = quotes
    .filter(quote => filterStatus === "Todos" || quote.status === filterStatus)
    .filter(quote => 
      quote.quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (leads.find(l => l.id === quote.leadId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const pageIsLoading = authLoading || isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{quotesNavItem?.label || "Cotizaciones"}</h2>
        <AddEditQuoteDialog
          trigger={
            <Button onClick={openNewQuoteDialog} disabled={pageIsLoading}>
              <PlusCircle className="mr-2 h-5 w-5" /> Añadir Cotización
            </Button>
          }
          isOpen={isQuoteDialogOpen}
          onOpenChange={setIsQuoteDialogOpen}
          quoteToEdit={editingQuote}
          leads={leads}
          users={users}
          currentUser={currentUser}
          onSave={handleSaveQuote}
          key={editingQuote ? `edit-${editingQuote.id}` : 'new-quote-dialog'}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por número o lead..."
            className="pl-8 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as "Todos" | Quote['status'])}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos los Estados</SelectItem>
            {QUOTE_STATUSES.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pageIsLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filteredQuotes.length > 0 ? (
        <div className="space-y-4">
          {filteredQuotes.map(quote => (
            <QuoteListItem
              key={quote.id}
              quote={quote}
              lead={leads.find(l => l.id === quote.leadId)}
              preparedBy={users.find(u => u.id === quote.preparedByUserId)}
              onEdit={() => openEditQuoteDialog(quote)}
              onDelete={() => handleDeleteQuote(quote.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-lg">No se encontraron cotizaciones.</p>
          <p>Intenta ajustar tus filtros o añade una nueva cotización.</p>
        </div>
      )}
    </div>
  );
}