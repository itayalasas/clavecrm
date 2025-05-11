"use client";

import { useState, useEffect } from "react";
import type { Invoice, Order, Lead, User } from "@/lib/types";
import { NAV_ITEMS, INVOICE_STATUSES, INITIAL_LEADS, INITIAL_USERS } from "@/lib/constants";
// Assuming INITIAL_ORDERS might be needed if invoices are created from orders directly
// import { INITIAL_ORDERS } from "@/lib/constants"; 
import { AddEditInvoiceDialog } from "@/components/invoices/add-edit-invoice-dialog";
import { InvoiceListItem } from "@/components/invoices/invoice-list-item";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]); // Placeholder for orders to link
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS); 
  const [users, setUsers] = useState<User[]>(INITIAL_USERS); 

  const [isLoading, setIsLoading] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"Todos" | Invoice['status']>("Todos");

  const invoicesNavItem = NAV_ITEMS.find(item => item.href === '/invoices');
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // TODO: Implement Firestore fetching for invoices, orders

  const handleSaveInvoice = async (invoiceData: Invoice) => {
    // TODO: Save to Firestore
    const isEditing = invoices.some(i => i.id === invoiceData.id);
    if (isEditing) {
      setInvoices(prevInvoices => prevInvoices.map(i => i.id === invoiceData.id ? invoiceData : i));
    } else {
      setInvoices(prevInvoices => [{...invoiceData, id: `invoice-${Date.now()}`}, ...prevInvoices]);
    }
    toast({
      title: isEditing ? "Factura Actualizada" : "Factura Creada",
      description: `La factura "${invoiceData.invoiceNumber}" ha sido ${isEditing ? 'actualizada' : 'creada'}.`,
    });
    setEditingInvoice(null);
    setIsInvoiceDialogOpen(false);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    // TODO: Delete from Firestore
     if (window.confirm("¿Estás seguro de que quieres eliminar esta factura?")) {
        setInvoices(prevInvoices => prevInvoices.filter(i => i.id !== invoiceId));
        toast({ title: "Factura Eliminada", variant: "destructive" });
    }
  };
  
  const openNewInvoiceDialog = () => {
    setEditingInvoice(null);
    setIsInvoiceDialogOpen(true);
  };

  const openEditInvoiceDialog = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setIsInvoiceDialogOpen(true);
  };

  const filteredInvoices = invoices
    .filter(invoice => filterStatus === "Todos" || invoice.status === filterStatus)
    .filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (leads.find(l => l.id === invoice.leadId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const pageIsLoading = authLoading || isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{invoicesNavItem?.label || "Facturas"}</h2>
         <AddEditInvoiceDialog
          trigger={
            <Button onClick={openNewInvoiceDialog} disabled={pageIsLoading}>
              <PlusCircle className="mr-2 h-5 w-5" /> Añadir Factura
            </Button>
          }
          isOpen={isInvoiceDialogOpen}
          onOpenChange={setIsInvoiceDialogOpen}
          invoiceToEdit={editingInvoice}
          orders={orders} // Pass orders for linking
          leads={leads}
          users={users}
          currentUser={currentUser}
          onSave={handleSaveInvoice}
          key={editingInvoice ? `edit-${editingInvoice.id}` : 'new-invoice-dialog'}
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
        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as "Todos" | Invoice['status'])}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos los Estados</SelectItem>
            {INVOICE_STATUSES.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pageIsLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filteredInvoices.length > 0 ? (
        <div className="space-y-4">
          {filteredInvoices.map(invoice => (
            <InvoiceListItem
              key={invoice.id}
              invoice={invoice}
              lead={leads.find(l => l.id === invoice.leadId)}
              order={orders.find(o => o.id === invoice.orderId)}
              issuedBy={users.find(u => u.id === invoice.issuedByUserId)}
              onEdit={() => openEditInvoiceDialog(invoice)}
              onDelete={() => handleDeleteInvoice(invoice.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-lg">No se encontraron facturas.</p>
          <p>Intenta ajustar tus filtros o añade una nueva factura.</p>
        </div>
      )}
    </div>
  );
}