
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Ticket, Lead, User, TicketStatus, TicketPriority, Comment } from "@/lib/types";
import { NAV_ITEMS, TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/constants";
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
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp, writeBatch, arrayUnion } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { addMonths, format, parseISO, startOfMonth } from "date-fns"; // format, parseISO used in TicketItem and AddEdit...Dialog
import { es } from 'date-fns/locale';

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]); // Keep using initial leads, or fetch if needed
  const [users, setUsers] = useState<User[]>([]);
  
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true); // Added for leads
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"Todos" | TicketStatus>("Todos");
  const [filterPriority, setFilterPriority] = useState<"Todas" | TicketPriority>("Todas");
  const [filterAssignee, setFilterAssignee] = useState<"Todos" | string>("Todos");

  const { toast } = useToast();
  const { getAllUsers, currentUser, loading: authLoading } = useAuth(); 
  const ticketsNavItem = NAV_ITEMS.find(item => item.href === '/tickets');

  const fetchTickets = useCallback(async () => {
    if (!currentUser) { 
      setIsLoadingTickets(false);
      return;
    }
    setIsLoadingTickets(true);
    try {
      const ticketsCollectionRef = collection(db, "tickets");
      // Add more complex querying if needed, e.g., based on user role for visibility
      const q = query(ticketsCollectionRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedTickets = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString() || undefined,
          reporterUserId: data.reporterUserId,
          assigneeUserId: data.assigneeUserId || undefined,
          relatedLeadId: data.relatedLeadId || undefined,
          attachments: data.attachments || [],
          comments: (data.comments || []).map((comment: any) => ({
            ...comment,
            createdAt: (comment.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          })),
        } as Ticket;
      });
      setTickets(fetchedTickets);
    } catch (error) {
      console.error("Error al obtener tickets:", error);
      toast({
        title: "Error al Cargar Tickets",
        description: "No se pudieron cargar los tickets desde la base de datos.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTickets(false);
    }
  }, [currentUser, toast]);

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error al obtener usuarios para la página de tickets:", error);
      toast({
        title: "Error al Cargar Usuarios",
        description: "No se pudieron cargar los datos de los usuarios para la asignación de tickets.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [getAllUsers, toast]);

  const fetchLeads = useCallback(async () => { // Added fetchLeads
    setIsLoadingLeads(true);
    try {
      const leadsCollectionRef = collection(db, "leads"); // Assuming 'leads' collection
      const querySnapshot = await getDocs(leadsCollectionRef);
      const fetchedLeads = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Lead));
      setLeads(fetchedLeads);
    } catch (error) {
      console.error("Error al obtener leads:", error);
      toast({
        title: "Error al Cargar Leads",
        description: "No se pudieron cargar los datos de los leads.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingLeads(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading) {
        fetchUsers();
        fetchLeads(); // Fetch leads
        if (currentUser) {
          fetchTickets();
        } else {
          setTickets([]);
          setIsLoadingTickets(false);
        }
    }
  }, [authLoading, currentUser, fetchUsers, fetchLeads, fetchTickets]);


  const handleSaveTicket = async (ticketData: Ticket) => {
    if (!currentUser) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }
    setIsSubmittingTicket(true);
    const isEditing = !!ticketData.id && tickets.some(t => t.id === ticketData.id);
    
    const ticketToSave: Ticket = {
      ...ticketData,
      comments: ticketData.comments || [], // Ensure comments is an array
    };
    
    try {
      const ticketDocRef = doc(db, "tickets", ticketData.id);
      const firestoreSafeTicket = {
        ...ticketToSave,
        createdAt: Timestamp.fromDate(new Date(ticketToSave.createdAt)),
        updatedAt: ticketToSave.updatedAt ? Timestamp.fromDate(new Date(ticketToSave.updatedAt)) : Timestamp.now(),
        comments: (ticketToSave.comments || []).map(comment => ({
          ...comment,
          createdAt: Timestamp.fromDate(new Date(comment.createdAt)),
        })),
      };
      
      await setDoc(ticketDocRef, firestoreSafeTicket, { merge: true }); 

      if (isEditing) {
        setTickets(prevTickets => prevTickets.map(t => t.id === ticketData.id ? ticketToSave : t)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) // Consider more complex sort
        );
      } else {
        setTickets(prevTickets => [ticketToSave, ...prevTickets]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      }
      toast({
        title: isEditing ? "Ticket Actualizado" : "Ticket Creado",
        description: `El ticket "${ticketToSave.title}" ha sido ${isEditing ? 'actualizado' : 'creado'} exitosamente.`,
      });
      setEditingTicket(null);
      setIsTicketDialogOpen(false);
    } catch (error) {
      console.error("Error al guardar ticket:", error);
      toast({
        title: "Error al Guardar Ticket",
        description: "Ocurrió un error al guardar el ticket.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    const ticketToDelete = tickets.find(t => t.id === ticketId);
    if (!ticketToDelete) return;

    if (window.confirm(`¿Estás seguro de que quieres eliminar el ticket "${ticketToDelete.title}"? Esta acción también eliminará los adjuntos asociados.`)) {
      try {
        // Delete attachments from Firebase Storage
        if (ticketToDelete.attachments && ticketToDelete.attachments.length > 0) {
          for (const attachment of ticketToDelete.attachments) {
            try {
              const fileRef = storageRef(storage, attachment.url);
              await deleteObject(fileRef);
            } catch (storageError: any) {
              // Log error but continue, e.g., file might not exist or permissions issue
              console.error(`Error eliminando adjunto ${attachment.name} de Storage:`, storageError);
              if (storageError.code !== 'storage/object-not-found') {
                 toast({ title: "Advertencia", description: `No se pudo eliminar el adjunto ${attachment.name}. Puede que necesite ser eliminado manualmente.`, variant: "default"});
              }
            }
          }
        }
         // Delete comments attachments if any (assuming comments are stored with tickets)
        if (ticketToDelete.comments && ticketToDelete.comments.length > 0) {
          for (const comment of ticketToDelete.comments) {
            if (comment.attachments && comment.attachments.length > 0) {
              for (const attachment of comment.attachments) {
                 try {
                    const fileRef = storageRef(storage, attachment.url);
                    await deleteObject(fileRef);
                  } catch (storageError: any) {
                    console.error(`Error eliminando adjunto de comentario ${attachment.name} de Storage:`, storageError);
                     if (storageError.code !== 'storage/object-not-found') {
                       toast({ title: "Advertencia", description: `No se pudo eliminar el adjunto de comentario ${attachment.name}.`, variant: "default"});
                    }
                  }
              }
            }
          }
        }


        const ticketDocRef = doc(db, "tickets", ticketId);
        await deleteDoc(ticketDocRef);
        setTickets(prevTickets => prevTickets.filter(ticket => ticket.id !== ticketId));
        toast({
          title: "Ticket Eliminado",
          description: `El ticket "${ticketToDelete.title}" ha sido eliminado.`,
          variant: "destructive",
        });
      } catch (error) {
        console.error("Error al eliminar ticket:", error);
        toast({
          title: "Error al Eliminar Ticket",
          description: "Ocurrió un error al eliminar el ticket.",
          variant: "destructive",
        });
      }
    }
  };

  const handleAddComment = async (ticketId: string, commentText: string, commentAttachments: {name: string, url: string}[]) => {
    if (!currentUser) {
      toast({title: "Error", description: "Debes iniciar sesión para comentar.", variant: "destructive"});
      return;
    }
    const ticketIndex = tickets.findIndex(t => t.id === ticketId);
    if (ticketIndex === -1) {
       toast({title: "Error", description: "Ticket no encontrado.", variant: "destructive"});
       return;
    }

    const newComment: Comment = {
      id: doc(collection(db, "tickets", ticketId, "comments")).id, // Or generate client-side UUID
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatarUrl: currentUser.avatarUrl,
      text: commentText,
      createdAt: new Date().toISOString(),
      attachments: commentAttachments,
    };

    try {
      const ticketDocRef = doc(db, "tickets", ticketId);
      await updateDoc(ticketDocRef, {
        comments: arrayUnion({
          ...newComment,
          createdAt: Timestamp.fromDate(new Date(newComment.createdAt)) // Store as Timestamp
        }),
        updatedAt: Timestamp.now() // Also update ticket's updatedAt field
      });

      // Optimistically update local state
      const updatedTickets = [...tickets];
      const updatedTicket = { ...updatedTickets[ticketIndex] };
      updatedTicket.comments = [...(updatedTicket.comments || []), newComment];
      updatedTicket.updatedAt = new Date().toISOString();
      updatedTickets[ticketIndex] = updatedTicket;
      setTickets(updatedTickets);

      toast({title: "Comentario Añadido", description: "Tu comentario ha sido añadido al ticket."});
      // TODO: Implement email notification to assignee/reporter if different from commenter
      // This would typically be done via a Firebase Cloud Function triggered on comment creation.
    } catch (error) {
      console.error("Error al añadir comentario:", error);
      toast({title: "Error al Comentar", description: "No se pudo añadir tu comentario.", variant: "destructive"});
    }
  };


  const openNewTicketDialog = () => {
    setEditingTicket(null);
    setIsTicketDialogOpen(true);
  };

  const openEditTicketDialog = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setIsTicketDialogOpen(true);
  };

  const filteredTickets = useMemo(() => {
    if (!currentUser) return [];

    return tickets
      .filter(ticket => {
        if (currentUser.role === 'admin' || currentUser.role === 'supervisor') {
          return true; 
        }
        return ticket.reporterUserId === currentUser.id || ticket.assigneeUserId === currentUser.id;
      })
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
  }, [tickets, searchTerm, filterStatus, filterPriority, filterAssignee, currentUser]); 

  const allTicketStatusesForTabs: ("Todos" | TicketStatus)[] = ["Todos", ...TICKET_STATUSES];
  
  const isLoading = authLoading || isLoadingUsers || isLoadingTickets || isLoadingLeads;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{ticketsNavItem ? ticketsNavItem.label : "Gestión de Tickets"}</h2>
        <AddEditTicketDialog
            trigger={
              <Button onClick={openNewTicketDialog} disabled={isLoadingUsers || isSubmittingTicket}>
                <PlusCircle className="mr-2 h-5 w-5" /> Abrir Nuevo Ticket
              </Button>
            }
            isOpen={isTicketDialogOpen}
            onOpenChange={setIsTicketDialogOpen}
            ticketToEdit={editingTicket}
            leads={leads}
            users={users}
            onSave={handleSaveTicket}
            key={editingTicket ? `edit-${editingTicket.id}` : 'new-ticket-dialog'}
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
        {(currentUser?.role === 'admin' || currentUser?.role === 'supervisor') && ( 
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
        )}
      </div>

      <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as "Todos" | TicketStatus)}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          {allTicketStatusesForTabs.map(status => (
            <TabsTrigger key={status} value={status}>{status}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? ( 
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
              currentUser={currentUser}
              onEdit={() => openEditTicketDialog(ticket)}
              onDelete={handleDeleteTicket}
              onAddComment={handleAddComment}
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
