
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Meeting, Lead, User, Contact } from "@/lib/types";
import { NAV_ITEMS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, PlusCircle, List, AlertTriangle } from "lucide-react";
import { AddEditMeetingDialog } from "@/components/calendar/add-edit-meeting-dialog";
import { CalendarView } from "@/components/calendar/calendar-view";
import { MeetingListItem } from "@/components/calendar/meeting-list-item"; 
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, doc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CalendarPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/calendar');
  const PageIcon = navItem?.icon || CalendarDays;

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]); // Assuming you have a contacts collection
  const [users, setUsers] = useState<User[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isMeetingDialogOpen, setIsMeetingDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  const { toast } = useToast();
  const { currentUser, getAllUsers } = useAuth();

  const fetchMeetings = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      // Query meetings where the current user is the creator or an attendee
      // This requires attendees to have a consistent structure (e.g., attendees.[userId].id)
      // For simplicity, fetching all meetings for now. Refine with proper attendee querying later.
      const q = query(collection(db, "meetings"), orderBy("startTime", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedMeetings = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          startTime: (data.startTime as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          endTime: (data.endTime as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          updatedAt: (data.updatedAt as Timestamp)?.toDate().toISOString() || undefined,
        } as Meeting;
      });
      setMeetings(fetchedMeetings);
    } catch (error) {
      console.error("Error fetching meetings:", error);
      toast({ title: "Error al Cargar Reuniones", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, toast]);

  const fetchLeadsAndContacts = useCallback(async () => {
    try {
      const leadsSnapshot = await getDocs(collection(db, "leads"));
      setLeads(leadsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Lead)));
      
      // Assuming contacts are stored in a "contacts" collection
      const contactsSnapshot = await getDocs(collection(db, "contacts"));
      setContacts(contactsSnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()} as Contact)));

    } catch (error) {
      console.error("Error fetching leads/contacts:", error);
      toast({ title: "Error al Cargar Datos de Soporte", description: "No se pudieron cargar leads/contactos.", variant: "destructive"});
    }
  }, [toast]);

  const fetchUsers = useCallback(async () => {
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: "Error al Cargar Usuarios", variant: "destructive"});
    }
  }, [getAllUsers, toast]);


  useEffect(() => {
    fetchMeetings();
    fetchLeadsAndContacts();
    fetchUsers();
  }, [fetchMeetings, fetchLeadsAndContacts, fetchUsers]);

  const handleSaveMeeting = async (meetingData: Omit<Meeting, 'id' | 'createdAt' | 'createdByUserId'>, id?: string) => {
    if (!currentUser) {
      toast({ title: "Error", description: "Debe iniciar sesión para guardar reuniones.", variant: "destructive" });
      return false;
    }
    setIsLoading(true);
    const meetingId = id || doc(collection(db, "meetings")).id;
    try {
      const dataToSave = {
        ...meetingData,
        id: meetingId,
        createdByUserId: id ? meetings.find(m=>m.id===id)?.createdByUserId || currentUser.id : currentUser.id,
        createdAt: id ? meetings.find(m=>m.id===id)?.createdAt || new Date().toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startTime: Timestamp.fromDate(new Date(meetingData.startTime)),
        endTime: Timestamp.fromDate(new Date(meetingData.endTime)),
      };

      await setDoc(doc(db, "meetings", meetingId), dataToSave, { merge: true });
      toast({ title: id ? "Reunión Actualizada" : "Reunión Creada", description: `La reunión "${meetingData.title}" ha sido guardada.` });
      fetchMeetings();
      setIsMeetingDialogOpen(false);
      return true;
    } catch (error) {
      console.error("Error saving meeting:", error);
      toast({ title: "Error al Guardar Reunión", variant: "destructive" });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar esta reunión?")) return;
    try {
      await deleteDoc(doc(db, "meetings", meetingId));
      toast({ title: "Reunión Eliminada", description: "La reunión ha sido eliminada." });
      fetchMeetings();
    } catch (error) {
      console.error("Error deleting meeting:", error);
      toast({ title: "Error al Eliminar Reunión", variant: "destructive" });
    }
  };
  
  const openNewMeetingDialog = () => {
    setEditingMeeting(null);
    setIsMeetingDialogOpen(true);
  };

  const openEditMeetingDialog = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setIsMeetingDialogOpen(true);
  };


  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <PageIcon className="h-6 w-6 text-primary" />
                {navItem?.label || "Calendario y Reuniones"}
              </CardTitle>
              <CardDescription>
                Gestiona tu agenda, programa reuniones, envía invitaciones y recibe recordatorios.
              </CardDescription>
            </div>
            <Button onClick={openNewMeetingDialog}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva Reunión
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="calendar"><CalendarDays className="mr-2 h-4 w-4" />Vista de Calendario</TabsTrigger>
          <TabsTrigger value="list"><List className="mr-2 h-4 w-4" />Lista de Reuniones</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar">
          <CalendarView meetings={meetings} onEditMeeting={openEditMeetingDialog} />
        </TabsContent>
        <TabsContent value="list">
          {isLoading ? (
             <div className="space-y-4 mt-4">
                <Skeleton className="h-20 w-full rounded-md" />
                <Skeleton className="h-20 w-full rounded-md" />
                <Skeleton className="h-20 w-full rounded-md" />
            </div>
          ) : meetings.length > 0 ? (
            <div className="space-y-4 mt-4">
              {meetings.map(meeting => (
                <MeetingListItem 
                  key={meeting.id}
                  meeting={meeting}
                  leads={leads}
                  users={users}
                  onEdit={openEditMeetingDialog}
                  onDelete={handleDeleteMeeting}
                />
              ))}
            </div>
          ) : (
            <Card className="mt-4">
              <CardContent className="pt-6 text-center text-muted-foreground">
                No hay reuniones programadas.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      
      <Card className="mt-4 bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center text-amber-700 text-lg gap-2">
            <AlertTriangle className="h-5 w-5" />
            Funcionalidades Avanzadas (En Desarrollo)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600">
          <ul className="list-disc list-inside space-y-1">
            <li>Envío de invitaciones (.ics) y recordatorios por correo electrónico.</li>
            <li>Sincronización con calendarios externos (Google Calendar, Outlook).</li>
            <li>Asignación de salas o recursos para reuniones.</li>
            <li>Vistas de calendario por semana y día completamente interactivas.</li>
          </ul>
          <p className="mt-3">La vista de calendario actual es básica. Las funcionalidades completas se implementarán progresivamente.</p>
        </CardContent>
      </Card>

      <AddEditMeetingDialog
        isOpen={isMeetingDialogOpen}
        onOpenChange={setIsMeetingDialogOpen}
        meetingToEdit={editingMeeting}
        onSave={handleSaveMeeting}
        leads={leads}
        contacts={contacts}
        users={users}
        currentUser={currentUser}
      />
    </div>
  );
}
