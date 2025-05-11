"use client";

import { useState, useEffect } from "react";
import type { Order, Lead, User } from "@/lib/types";
import { NAV_ITEMS, ORDER_STATUSES, INITIAL_LEADS, INITIAL_USERS } from "@/lib/constants";
import { AddEditOrderDialog } from "@/components/orders/add-edit-order-dialog";
import { OrderListItem } from "@/components/orders/order-list-item";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS); 
  const [users, setUsers] = useState<User[]>(INITIAL_USERS); 

  const [isLoading, setIsLoading] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"Todos" | Order['status']>("Todos");

  const ordersNavItem = NAV_ITEMS.find(item => item.href === '/orders');
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // TODO: Implement Firestore fetching for orders

  const handleSaveOrder = async (orderData: Order) => {
    // TODO: Save to Firestore
    const isEditing = orders.some(o => o.id === orderData.id);
    if (isEditing) {
      setOrders(prevOrders => prevOrders.map(o => o.id === orderData.id ? orderData : o));
    } else {
      setOrders(prevOrders => [{...orderData, id: `order-${Date.now()}`}, ...prevOrders]);
    }
    toast({
      title: isEditing ? "Pedido Actualizado" : "Pedido Creado",
      description: `El pedido "${orderData.orderNumber}" ha sido ${isEditing ? 'actualizado' : 'creado'}.`,
    });
    setEditingOrder(null);
    setIsOrderDialogOpen(false);
  };

  const handleDeleteOrder = async (orderId: string) => {
    // TODO: Delete from Firestore
     if (window.confirm("¿Estás seguro de que quieres eliminar este pedido?")) {
        setOrders(prevOrders => prevOrders.filter(o => o.id !== orderId));
        toast({ title: "Pedido Eliminado", variant: "destructive" });
    }
  };
  
  const openNewOrderDialog = () => {
    setEditingOrder(null);
    setIsOrderDialogOpen(true);
  };

  const openEditOrderDialog = (order: Order) => {
    setEditingOrder(order);
    setIsOrderDialogOpen(true);
  };

  const filteredOrders = orders
    .filter(order => filterStatus === "Todos" || order.status === filterStatus)
    .filter(order => 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (leads.find(l => l.id === order.leadId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const pageIsLoading = authLoading || isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{ordersNavItem?.label || "Pedidos"}</h2>
         <AddEditOrderDialog
          trigger={
            <Button onClick={openNewOrderDialog} disabled={pageIsLoading}>
              <PlusCircle className="mr-2 h-5 w-5" /> Añadir Pedido
            </Button>
          }
          isOpen={isOrderDialogOpen}
          onOpenChange={setIsOrderDialogOpen}
          orderToEdit={editingOrder}
          leads={leads}
          users={users}
          currentUser={currentUser}
          onSave={handleSaveOrder}
          key={editingOrder ? `edit-${editingOrder.id}` : 'new-order-dialog'}
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
        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as "Todos" | Order['status'])}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos los Estados</SelectItem>
            {ORDER_STATUSES.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pageIsLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-4">
          {filteredOrders.map(order => (
            <OrderListItem
              key={order.id}
              order={order}
              lead={leads.find(l => l.id === order.leadId)}
              placedBy={users.find(u => u.id === order.placedByUserId)}
              onEdit={() => openEditOrderDialog(order)}
              onDelete={() => handleDeleteOrder(order.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-lg">No se encontraron pedidos.</p>
          <p>Intenta ajustar tus filtros o añade un nuevo pedido.</p>
        </div>
      )}
    </div>
  );
}