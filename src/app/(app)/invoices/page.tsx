
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Invoice, Order, Lead, User } from "@/lib/types";
import { NAV_ITEMS, INVOICE_STATUSES } from "@/lib/constants";
import { AddEditInvoiceDialog } from "@/components/invoices/add-edit-invoice-dialog";
import { InvoiceListItem } from "@/components/invoices/invoice-list-item";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from "firebase/firestore";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]); 
  const [leads, setLeads] = useState<Lead[]>([]); 
  const [users, setUsers] = useState<User[]>([]); 

  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"Todos" | Invoice['status']>("Todos");

  const invoicesNavItem = NAV_ITEMS.find(item => item.href === '/invoices');
  const { currentUser, loading: authLoading, getAllUsers } = useAuth();
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    if (!currentUser) {
      setIsLoadingInvoices(false);
      return;
    }
    setIsLoadingInvoices(true);
    try {
      const invoicesCollectionRef = collection(db, "invoices");
      const q = query(invoicesCollectionRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedInvoices = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString() || undefined,
          dueDate: (data.dueDate as Timestamp)?.toDate().toISOString() || '', // Ensure dueDate is string
          paymentDate: (data.paymentDate as Timestamp)?.toDate().toISOString() || undefined,
        } as Invoice;
      });
      setInvoices(fetchedInvoices);
    } catch (error) {
      console.error("Error al obtener facturas:", error);
      toast({
        title: "Error al Cargar Facturas",
        description: "No se pudieron cargar las facturas desde la base de datos.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingInvoices(false);
    }
  }, [currentUser, toast]);

  const fetchOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const ordersCollectionRef = collection(db, "orders");
      const querySnapshot = await getDocs(ordersCollectionRef);
      const fetchedOrders = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Order));
      setOrders(fetchedOrders);
    } catch (error) {
      console.error("Error al obtener pedidos:", error);
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    setIsLoadingLeads(true);
    try {
      const leadsCollectionRef = collection(db, "leads");
      const querySnapshot = await getDocs(leadsCollectionRef);
      const fetchedLeads = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Lead));
      setLeads(fetchedLeads);
    } catch (error) {
      console.error("Error al obtener leads:", error);
    } finally {
      setIsLoadingLeads(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error al obtener usuarios para facturas:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [getAllUsers]);

  useEffect(() => {
    if (!authLoading) {
      fetchOrders();
      fetchLeads();
      fetchUsers();
      if (currentUser) {
        fetchInvoices();
      } else {
        setInvoices([]);
        setIsLoadingInvoices(false);
      }
    }
  }, [authLoading, currentUser, fetchInvoices, fetchOrders, fetchLeads, fetchUsers]);

  const handleSaveInvoice = async (invoiceData: Invoice) => {
    if (!currentUser) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }
    setIsSubmittingInvoice(true);
    const isEditing = invoices.some(i => i.id === invoiceData.id);

    const firestoreSafeInvoice = {
      ...invoiceData,
      createdAt: Timestamp.fromDate(new Date(invoiceData.createdAt)),
      updatedAt: Timestamp.now(),
      dueDate: Timestamp.fromDate(new Date(invoiceData.dueDate)),
      paymentDate: invoiceData.paymentDate ? Timestamp.fromDate(new Date(invoiceData.paymentDate)) : null,
      issuedByUserId: invoiceData.issuedByUserId || currentUser.id,
    };

    try {
      const invoiceDocRef = doc(db, "invoices", invoiceData.id);
      await setDoc(invoiceDocRef, firestoreSafeInvoice, { merge: true });
      
      fetchInvoices(); // Re-fetch
      toast({
        title: isEditing ? "Factura Actualizada" : "Factura Creada",
        description: `La factura "${invoiceData.invoiceNumber}" ha sido ${isEditing ? 'actualizada' : 'creada'} exitosamente.`,
      });
      setEditingInvoice(null);
      setIsInvoiceDialogOpen(false);
    } catch (error) {
      console.error("Error al guardar factura:", error);
      toast({
        title: "Error al Guardar Factura",
        description: "Ocurrió un error al guardar la factura.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!currentUser) return;
    const invoiceToDelete = invoices.find(inv => inv.id === invoiceId);
    if (!invoiceToDelete) return;

     if (window.confirm(`¿Estás seguro de que quieres eliminar la factura "${invoiceToDelete.invoiceNumber}"?`)) {
        try {
            const invoiceDocRef = doc(db, "invoices", invoiceId);
            await deleteDoc(invoiceDocRef);
            fetchInvoices();
            toast({ title: "Factura Eliminada", description: `La factura "${invoiceToDelete.invoiceNumber}" ha sido eliminada.`, variant: "default" });
        } catch(error) {
            console.error("Error al eliminar factura:", error);
            toast({ title: "Error al Eliminar Factura", variant: "destructive" });
        }
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

  const filteredInvoices = useMemo(() => invoices
    .filter(invoice => filterStatus === "Todos" || invoice.status === filterStatus)
    .filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (leads.find(l => l.id === invoice.leadId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
    ), [invoices, filterStatus, searchTerm, leads]);

  const pageIsLoading = authLoading || isLoadingInvoices || isLoadingOrders || isLoadingLeads || isLoadingUsers;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{invoicesNavItem?.label || "Facturas"}</h2>
         <AddEditInvoiceDialog
          trigger={
            <Button onClick={openNewInvoiceDialog} disabled={pageIsLoading || isSubmittingInvoice}>
              <PlusCircle className="mr-2 h-5 w-5" /> Añadir Factura
            </Button>
          }
          isOpen={isInvoiceDialogOpen}
          onOpenChange={setIsInvoiceDialogOpen}
          invoiceToEdit={editingInvoice}
          orders={orders}
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
            disabled={pageIsLoading}
          />
        </div>
        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as "Todos" | Invoice['status'])} disabled={pageIsLoading}>
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

      {pageIsLoading && invoices.length === 0 ? (
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
