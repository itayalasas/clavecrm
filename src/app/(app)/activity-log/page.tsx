
"use client";

import { useState, useEffect, useCallback } from "react";
import type { ActivityLog, Lead, Contact, Ticket, User, Opportunity } from "@/lib/types";
import { NAV_ITEMS, ACTIVITY_TYPES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileClock, PlusCircle, Search, Filter } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, orderBy, Timestamp, serverTimestamp } from "firebase/firestore";
import { AddEditActivityLogDialog } from "@/components/activity-log/add-edit-activity-log-dialog";
import { ActivityLogListItem } from "@/components/activity-log/activity-log-list-item";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge"; // Added import

export default function ActivityLogPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.href === '/activity-log');
  const PageIcon = navItem?.icon || FileClock;

  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityLog | null>(null); // For future edit functionality

  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]); // Placeholder for Opportunity
  const [users, setUsers] = useState<User[]>([]);


  const { currentUser, getAllUsers } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const fetchActivities = useCallback(async () => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const q = query(collection(db, "activityLogs"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedActivities = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: (data.timestamp as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        } as ActivityLog;
      });
      setActivities(fetchedActivities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      toast({ title: "Error al Cargar Actividades", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, toast]);

  const fetchSupportData = useCallback(async () => {
    try {
      const [leadsSnapshot, contactsSnapshot, ticketsSnapshot, allUsers] = await Promise.all([
        getDocs(collection(db, "leads")),
        getDocs(collection(db, "contacts")),
        getDocs(collection(db, "tickets")),
        getAllUsers(),
        // getDocs(collection(db, "opportunities")), // Fetch opportunities when available
      ]);

      setLeads(leadsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Lead)));
      setContacts(contactsSnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()} as Contact)));
      setTickets(ticketsSnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()} as Ticket)));
      setUsers(allUsers);
      // setOpportunities(opportunitiesSnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()} as Opportunity)));
    } catch (error) {
      console.error("Error fetching support data:", error);
      toast({ title: "Error al Cargar Datos de Soporte", variant: "destructive"});
    }
  }, [getAllUsers, toast]);

  useEffect(() => {
    fetchActivities();
    fetchSupportData();
  }, [fetchActivities, fetchSupportData]);

  const handleSaveActivity = async (activityData: Omit<ActivityLog, 'id' | 'createdAt' | 'loggedByUserId'>) => {
    if (!currentUser) {
      toast({ title: "Error de autenticación", variant: "destructive" });
      return false;
    }
    try {
      await addDoc(collection(db, "activityLogs"), {
        ...activityData,
        timestamp: Timestamp.fromDate(new Date(activityData.timestamp)),
        loggedByUserId: currentUser.id,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Actividad Registrada", description: "La nueva actividad ha sido guardada." });
      fetchActivities();
      return true;
    } catch (error) {
      console.error("Error saving activity:", error);
      toast({ title: "Error al Guardar Actividad", variant: "destructive" });
      return false;
    }
  };

  const filteredActivities = activities.filter(activity =>
    activity.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    activity.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
    users.find(u => u.id === activity.loggedByUserId)?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    leads.find(l => l.id === activity.relatedLeadId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );


  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                <PageIcon className="h-6 w-6 text-primary" />
                {navItem?.label || "Registro de Actividades"}
                </CardTitle>
                <CardDescription>
                Mantén un historial de todas las interacciones con tus clientes: llamadas, reuniones, correos y notas.
                </CardDescription>
            </div>
            <Button onClick={() => { setEditingActivity(null); setIsDialogOpen(true); }} disabled={isLoading}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva Actividad
            </Button>
          </div>
           <div className="flex gap-2 mt-4">
            <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    type="search" 
                    placeholder="Buscar por asunto, detalle, usuario o lead..." 
                    className="pl-8 w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button variant="outline" disabled>
                <Filter className="mr-2 h-4 w-4" /> Filtrar
            </Button>
        </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : filteredActivities.length > 0 ? (
            <div className="space-y-4">
              {filteredActivities.map(activity => (
                <ActivityLogListItem 
                  key={activity.id} 
                  activity={activity} 
                  users={users}
                  leads={leads}
                  contacts={contacts}
                  tickets={tickets}
                  opportunities={opportunities}
                  onEdit={() => { /* TODO: Implement edit */ setEditingActivity(activity); setIsDialogOpen(true); }}
                  onDelete={() => { /* TODO: Implement delete */ }}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm ? "No se encontraron actividades con ese criterio." : "No hay actividades registradas. Empieza añadiendo una."}
            </p>
          )}
        </CardContent>
      </Card>

      {currentUser && (
        <AddEditActivityLogDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          activityToEdit={editingActivity}
          onSave={handleSaveActivity}
          leads={leads}
          contacts={contacts}
          tickets={tickets}
          opportunities={opportunities} // Pass opportunities
          currentUser={currentUser}
        />
      )}

      <Card className="mt-4 bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center text-amber-700 text-lg gap-2">
            <FileClock className="h-5 w-5" />
            Estado de Desarrollo de Funcionalidades
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-600">
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Registro manual de actividades:</strong> 
              <Badge variant="default" className="ml-2 bg-green-500 hover:bg-green-600 text-white">Implementado</Badge>
              <p className="text-xs pl-5">Puedes registrar manualmente llamadas, reuniones, notas y visitas.</p>
            </li>
            <li>
              <strong>Asociación de actividades a leads, contactos y tickets:</strong>
              <Badge variant="default" className="ml-2 bg-green-500 hover:bg-green-600 text-white">Implementado</Badge>
               <p className="text-xs pl-5">Se pueden asociar actividades a estos elementos existentes. Asociación a Oportunidades (Pendiente).</p>
            </li>
             <li>
              <strong>Filtros y búsqueda avanzada:</strong>
              <Badge variant="default" className="ml-2 bg-yellow-500 hover:bg-yellow-600 text-black">Básico Implementado</Badge>
              <p className="text-xs pl-5">Búsqueda básica implementada. Filtros avanzados por tipo, fecha, etc. están pendientes.</p>
            </li>
            <li>
              <strong>Visualización cronológica por cliente:</strong>
              <Badge variant="outline" className="ml-2 border-gray-500 text-gray-600">Planeado</Badge>
              <p className="text-xs pl-5">Se desarrollará una vista específica para ver el historial de interacciones por cliente.</p>
            </li>
             <li>
              <strong>Integración con módulo de correo:</strong>
              <Badge variant="outline" className="ml-2 border-gray-500 text-gray-600">Planeado</Badge>
              <p className="text-xs pl-5">Registro automático de correos enviados/recibidos (requiere configuración completa del módulo de email).</p>
            </li>
            <li>
              <strong>Funcionalidades Avanzadas (Futuro):</strong>
              <ul className="list-circle list-inside ml-4 mt-1">
                <li>Grabación de llamadas (requiere integración con sistema de telefonía).</li>
                <li>Análisis de sentimiento de correos o transcripciones (requiere IA y puede tener costos adicionales).</li>
              </ul>
            </li>
          </ul>
          <p className="mt-4 font-semibold">Las funcionalidades se implementarán progresivamente.</p>
        </CardContent>
      </Card>
    </div>
  );
}

