
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Ticket, Lead, User, TicketStatus, TicketPriority } from "@/lib/types";
import { INITIAL_TICKETS, INITIAL_LEADS, NAV_ITEMS, TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/constants";
import { TicketItem } from "@/components/tickets/ticket-item";
import { AddEditTicketDialog } from "@/components/tickets/add-edit-ticket-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Skeleton } from "@/components/ui/skeleton";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"Todos" | TicketStatus>("Todos");
  const [filterPriority, setFilterPriority] = useState<"Todas" | TicketPriority>("Todas");
  const [filterAssignee, setFilterAssignee] = useState<"Todos" | string>("Todos");

  const { toast } = useToast();
  const { getAllUsers } = useAuth();
  const ticketsNavItem = NAV_ITEMS.find(item => item.href === '/tickets');

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users for tickets page:", error);
      toast({
        title: "Error al Cargar Usuarios",
        description: "No se pudieron cargar los datos de los usuarios para la asignación de tickets.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [getAllUsers, toast]);


  useEffect(() => {
    // Simulate fetching tickets and leads
    setTickets(INITIAL_TICKETS.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setLeads(INITIAL_LEADS);
    fetchUsers();
  }, [fetchUsers]);

  const handleSaveTicket = (ticket: Ticket) => {
    const isEditOperation = !!editingTicket;

    setTickets(prevTickets => {
      const existingTicketIndex = prevTickets.findIndex(t => t.id === ticket.id);
      let newTickets;
      if (existingTicketIndex > -1) {
        newTickets = [...prevTickets];
        newTickets[existingTicketIndex] = ticket;
      } else {
        newTickets = [ticket, ...prevTickets];
      }
      return newTickets.sort((a, b) => {
        const statusOrder = (s: TicketStatus) => TICKET_STATUSES.indexOf(s);
        if (statusOrder(a.status) !== statusOrder(b.status)) {
          return statusOrder(a.status) - statusOrder(b.status);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });
    setIsDialogOpen(false);
    setEditingTicket(null);
    toast({
        title: isEditOperation ? "Ticket Actualizado" : "Ticket Creado",
        description: `El ticket "${ticket.title}" ha sido ${isEditOperation ? 'actualizado' : 'creado'} exitosamente.`,
    });
  };

  const handleDeleteTicket = (ticketId: string) => {
    const ticketToDelete = tickets.find(t => t.id === ticketId);
    if (window.confirm(`¿Estás seguro de que quieres eliminar el ticket "${ticketToDelete?.title}"?`)) {
        setTickets(prevTickets => prevTickets.filter(ticket => ticket.id !== ticketId));
        toast({
            title: "Ticket Eliminado",
            description: `El ticket "${ticketToDelete?.title}" ha sido eliminado.`,
            variant: "destructive",
        });
    }
  };

  const openNewTicketDialog = () => {
    setEditingTicket(null);
    setIsDialogOpen(true);
  };

  const openEditTicketDialog = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setIsDialogOpen(true);
  };

  const filteredTickets = useMemo(() => {
    return tickets
      .filter(ticket => {
        if (filterStatus === "Todos") return true;
        return ticket.status === filterStatus;
      })
      .filter(ticket => {
        if (filterPriority === "Todas") return true;
        return ticket.priority === filterPriority;
      })
      .filter(ticket => {
        if (filterAssignee === "Todos") return true;
        if (filterAssignee === "unassigned") return !ticket.assigneeUserId;
        return ticket.assigneeUserId === filterAssignee;
      })
      .filter(ticket =>
        ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [tickets, searchTerm, filterStatus, filterPriority, filterAssignee]);

  const allTicketStatusesForTabs: ("Todos" | TicketStatus)[] = ["Todos", ...TICKET_STATUSES];


  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{ticketsNavItem ? ticketsNavItem.label : "Gestión de Tickets"}</h2>
        <Button onClick={openNewTicketDialog} disabled={isLoadingUsers}>
          <PlusCircle className="mr-2 h-5 w-5" /> Abrir Nuevo Ticket
        </Button>
        <AddEditTicketDialog
          trigger={<span className="hidden" />}
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          ticketToEdit={editingTicket}
          leads={leads}
          users={users}
          onSave={handleSaveTicket}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative md:col-span-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por título, descripción o ID..."
            className="pl-8 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterPriority} onValueChange={(value: TicketPriority | "Todas") => setFilterPriority(value)}>
          <SelectTrigger className="w-full">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todas">Todas las Prioridades</SelectItem>
            {TICKET_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignee} onValueChange={(value: string | "Todos") => setFilterAssignee(value)} disabled={isLoadingUsers}>
          <SelectTrigger className="w-full">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por asignado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos los Asignados</SelectItem>
            <SelectItem value="unassigned">Sin asignar</SelectItem>
            {users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as "Todos" | TicketStatus)}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          {allTicketStatusesForTabs.map(status => (
            <TabsTrigger key={status} value={status}>{status}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoadingUsers ? (
         <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : filteredTickets.length > 0 ? (
        <div className="space-y-4">
          {filteredTickets.map(ticket => (
            <TicketItem
              key={ticket.id}
              ticket={ticket}
              leads={leads}
              users={users}
              onEdit={() => openEditTicketDialog(ticket)}
              onDelete={handleDeleteTicket}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-lg">No se encontraron tickets.</p>
          <p>Intenta ajustar tus filtros o abre un nuevo ticket.</p>
        </div>
      )}
    </div>
  );
}
