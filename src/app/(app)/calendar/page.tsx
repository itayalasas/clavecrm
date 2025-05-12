
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Meeting, Lead, User, Contact } from "@/lib/types";
import { NAV_ITEMS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, PlusCircle, List, AlertTriangle, Send, Users as UsersIcon, Video } from "lucide-react";
import { AddEditMeetingDialog } from "@/components/calendar/add-edit-meeting-dialog";
import { CalendarView } from "@/components/calendar/calendar-view";
import { MeetingListItem } from "@/components/calendar/meeting-list-item"; 
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, doc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function CalendarPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/calendar');
  const PageIcon = navItem?.icon || CalendarDays;

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
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
      console.error("Error al obtener reuniones:", error);
      toast({ title: "Error al Cargar Reuniones", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, toast]);

  const fetchLeadsAndContacts = useCallback(async () => {
    try {
      const leadsSnapshot = await getDocs(collection(db, "leads"));
      setLeads(leadsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Lead)));
      
      const contactsSnapshot = await getDocs(collection(db, "contacts"));
      setContacts(contactsSnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()} as Contact)));

    } catch (error) {
      console.error("Error al obtener leads/contactos:", error);
      toast({ title: "Error al Cargar Datos de Soporte", description: "No se pudieron cargar leads/contactos.", variant: "destructive"});
    }
  }, [toast]);

  const fetchUsers = useCallback(async () => {
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error("Error al obtener usuarios:", error);
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
      // Placeholder: Aquí se dispararía el envío de .ics si es una nueva reunión o hay cambios relevantes
      if (!id || (id && JSON.stringify(meetings.find(m=>m.id===id)?.attendees) !== JSON.stringify(meetingData.attendees))) {
        toast({ title: "Invitaciones (Simulado)", description: "En un entorno real, se enviarían invitaciones .ics y recordatorios por correo.", variant: "default", duration: 5000 });
      }
      return true;
    } catch (error) {
      console.error("Error guardando reunión:", error);
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
      console.error("Error eliminando reunión:", error);
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
          <CalendarView 
            meetings={meetings} 
            onEditMeeting={openEditMeetingDialog}
            leads={leads}
            users={users}
            />
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
            Estado de Desarrollo de Funcionalidades
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600">
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Envío de invitaciones (.ics) y recordatorios por correo electrónico:</strong> 
              <Badge variant="default" className="ml-2 bg-green-500 text-white">Parcialmente Implementado</Badge>
              <p className="text-xs pl-5">Actualmente simulado con un toast. El envío real requiere configuración de backend (Cloud Functions y servicio de correo).</p>
            </li>
            <li>
              <strong>Vistas de calendario por semana y día completamente interactivas:</strong>
              <Badge variant="destructive" className="ml-2">En Desarrollo</Badge>
              <p className="text-xs pl-5">La vista de calendario actual es mensual y básica. Se implementarán vistas más detalladas e interactivas.</p>
            </li>
             <li>
              <strong>Asignación de salas o recursos para reuniones:</strong>
              <Badge variant="default" className="ml-2 bg-yellow-500 text-black">Parcialmente Implementado</Badge>
              <p className="text-xs pl-5">Se añadió campo para recursos/sala en el formulario. La gestión y disponibilidad de recursos está en desarrollo.</p>
            </li>
            <li>
              <strong>Sincronización con calendarios externos (Google Calendar, Outlook):</strong>
              <Badge variant="outline" className="ml-2 border-gray-500 text-gray-600">Planeado (Avanzado)</Badge>
              <p className="text-xs pl-5">Esta funcionalidad es compleja y se considera para futuras versiones mayores.</p>
            </li>
          </ul>
          <p className="mt-4 font-semibold">Las funcionalidades se implementarán progresivamente.</p>
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

