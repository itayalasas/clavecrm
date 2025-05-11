
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
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp, writeBatch, arrayUnion, onSnapshot } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { format, parseISO, startOfMonth } from "date-fns"; // format, parseISO used in TicketItem and AddEdit...Dialog
import { es } from 'date-fns/locale';

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]); 
  const [users, setUsers] = useState<User[]>([]);
  
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true); 
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
      // Real-time listener for tickets
      const q = query(ticketsCollectionRef, orderBy("createdAt", "desc"));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
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
            // Comments are now handled by TicketItem in real-time
            solutionDescription: data.solutionDescription || undefined,
            solutionAttachments: data.solutionAttachments || [],
          } as Ticket;
        });
        setTickets(fetchedTickets);
        setIsLoadingTickets(false);
      }, (error) => {
        console.error("Error al obtener tickets en tiempo real:", error);
        toast({
          title: "Error al Cargar Tickets",
          description: "No se pudieron cargar los tickets desde la base de datos.",
          variant: "destructive",
        });
        setIsLoadingTickets(false);
      });
      
      return () => unsubscribe(); // Return unsubscribe function for cleanup

    } catch (error) { // Catch for initial query setup errors, though onSnapshot handles stream errors
      console.error("Error al configurar la escucha de tickets:", error);
      toast({
        title: "Error al Configurar Tickets",
        description: "No se pudo iniciar la carga de tickets.",
        variant: "destructive",
      });
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
    let unsubscribeTickets: (() => void) | undefined;
    if (!authLoading) {
        fetchUsers();
        fetchLeads(); 
        if (currentUser) {
          // fetchTickets now returns an unsubscribe function
          fetchTickets().then(unsub => { unsubscribeTickets = unsub });
        } else {
          setTickets([]);
          setIsLoadingTickets(false);
        }
    }
    return () => { // Cleanup function for useEffect
      if (unsubscribeTickets) {
        unsubscribeTickets();
      }
    };
  }, [authLoading, currentUser, fetchUsers, fetchLeads, fetchTickets]);


  const handleSaveTicket = async (ticketData: Ticket) => {
    if (!currentUser) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }
    setIsSubmittingTicket(true);
    const isEditing = tickets.some(t => t.id === ticketData.id);
    
    const ticketToSave: Ticket = {
      ...ticketData,
      // comments are managed by TicketItem's subcollection listener
      solutionDescription: ticketData.solutionDescription || "",
      solutionAttachments: ticketData.solutionAttachments || [],
      updatedAt: new Date().toISOString(), // Always update this on save
    };
    
    try {
      const ticketDocRef = doc(db, "tickets", ticketToSave.id);
      const { ...ticketDataForFirestore } = ticketToSave; // Destructure to remove any client-side only fields if necessary
      
      const firestoreSafeTicket = {
        ...ticketDataForFirestore,
        createdAt: Timestamp.fromDate(new Date(ticketToSave.createdAt)),
        updatedAt: Timestamp.fromDate(new Date(ticketToSave.updatedAt!)),
        assigneeUserId: ticketToSave.assigneeUserId || null, 
        relatedLeadId: ticketToSave.relatedLeadId || null, 
        // comments are NOT stored in the main ticket document anymore.
      };
      
      await setDoc(ticketDocRef, firestoreSafeTicket, { merge: true }); 

      // No local state update for tickets needed here, onSnapshot will handle it.
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

    if (window.confirm(`¿Estás seguro de que quieres eliminar el ticket "${ticketToDelete.title}"? Esta acción también eliminará los adjuntos asociados y comentarios.`)) {
      try {
        // Delete ticket attachments
        if (ticketToDelete.attachments && ticketToDelete.attachments.length > 0) {
          for (const attachment of ticketToDelete.attachments) {
            try {
              const fileRef = storageRef(storage, attachment.url); await deleteObject(fileRef);
            } catch (e) { console.warn("Falló al eliminar adjunto del ticket", attachment.url, e); }
          }
        }
         // Delete solution attachments
        if (ticketToDelete.solutionAttachments && ticketToDelete.solutionAttachments.length > 0) {
          for (const attachment of ticketToDelete.solutionAttachments) {
             try {
              const fileRef = storageRef(storage, attachment.url); await deleteObject(fileRef);
            } catch (e) { console.warn("Falló al eliminar adjunto de la solución", attachment.url, e); }
          }
        }
        
        // Delete comment attachments (if any are stored - good practice to check)
        // This requires fetching comments first, or a more robust backend cleanup.
        // For now, we assume attachments are deleted with the ticket storage path if structured well.
        // Or, iterate through comments from TicketItem if it had them.
        // Simplified: Deleting main ticket doc + its subcollection via a batched write or Cloud Function is more robust.

        // Delete comments subcollection (client-side deletion is complex for subcollections)
        // A common pattern is a Cloud Function triggered on ticket deletion.
        // For client-side, you'd fetch all comment docs and delete them one by one or in a batch.
        // This is a simplified deletion from client for now.
        const commentsColRef = collection(db, "tickets", ticketId, "comments");
        const commentsSnapshot = await getDocs(commentsColRef);
        const batch = writeBatch(db);
        commentsSnapshot.docs.forEach(commentDoc => {
            // Also delete comment attachments here if they exist and paths are known
            const commentData = commentDoc.data() as Comment;
            if (commentData.attachments) {
                for (const att of commentData.attachments) {
                    try { storageRef(storage, att.url); deleteObject(storageRef(storage, att.url)); } catch (e) {console.warn("Error deleting comment attachment", e)}
                }
            }
            batch.delete(commentDoc.ref);
        });
        await batch.commit();


        const ticketDocRef = doc(db, "tickets", ticketId);
        await deleteDoc(ticketDocRef);
        
        // Local state update will be handled by onSnapshot
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
    
    const newComment: Omit<Comment, 'id'> & { createdAt: Timestamp } = { // Prepare for Firestore
      userId: currentUser.id,
      userName: currentUser.name || "Usuario Anónimo",
      userAvatarUrl: currentUser.avatarUrl || null,
      text: commentText,
      createdAt: Timestamp.now(), // Use Firestore Timestamp directly
      attachments: commentAttachments,
    };

    try {
      const commentDocRef = doc(collection(db, "tickets", ticketId, "comments")); // Auto-generate ID
      await setDoc(commentDocRef, newComment);
      
      // Update the main ticket's 'updatedAt'
      const ticketDocRef = doc(db, "tickets", ticketId);
      await updateDoc(ticketDocRef, {
        updatedAt: Timestamp.now(),
      });

      // No local state update for comments in TicketsPage. TicketItem's onSnapshot handles this.
      toast({title: "Comentario Añadido", description: "Tu comentario ha sido añadido al ticket."});
    } catch (error) {
      console.error("Error al añadir comentario:", error);
      toast({title: "Error al Comentar", description: "No se pudo añadir tu comentario.", variant: "destructive"});
    }
  };

  const handleUpdateTicketSolution = async (
    ticketId: string, 
    solutionDescription: string, 
    solutionAttachments: { name: string; url: string }[],
    status: TicketStatus
  ) => {
    if (!currentUser) {
        toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
        return;
    }
    const ticketToUpdate = tickets.find(t => t.id === ticketId);
    if (!ticketToUpdate) {
       toast({title: "Error", description: "Ticket no encontrado.", variant: "destructive"});
       return;
    }

    if (currentUser.id !== ticketToUpdate.assigneeUserId && currentUser.role !== 'admin' && currentUser.role !== 'supervisor') {
        toast({title: "Acción no permitida", description: "Solo el usuario asignado o un administrador/supervisor puede registrar la solución.", variant: "destructive"});
        return;
    }

    const updatedTicketData = {
        solutionDescription,
        solutionAttachments,
        status,
        updatedAt: Timestamp.now(),
    };

    try {
        const ticketDocRef = doc(db, "tickets", ticketId);
        await updateDoc(ticketDocRef, updatedTicketData);
        // Local state update handled by onSnapshot
        toast({title: "Solución Actualizada", description: `La solución para el ticket "${ticketToUpdate.title}" ha sido guardada.`});
    } catch (error) {
        console.error("Error al actualizar la solución del ticket:", error);
        toast({title: "Error al Guardar Solución", description: "No se pudo guardar la solución del ticket.", variant: "destructive"});
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

    return tickets // tickets state is now updated by onSnapshot
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

      {isLoading && tickets.length === 0 ? ( // Show skeleton only if truly loading initial data
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
              onEdit={openEditTicketDialog}
              onDelete={handleDeleteTicket}
              onAddComment={handleAddComment}
              onUpdateTicketSolution={handleUpdateTicketSolution}
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

