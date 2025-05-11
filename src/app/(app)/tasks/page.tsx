
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Task, Lead, User } from "@/lib/types";
import { INITIAL_LEADS, NAV_ITEMS } from "@/lib/constants"; 
import { TaskItem } from "@/components/tasks/task-item";
import { AddEditTaskDialog } from "@/components/tasks/add-edit-task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, where, Timestamp, writeBatch } from "firebase/firestore";
import { addMonths, setDate, startOfMonth } from "date-fns";


export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS); // Keep using initial leads, or fetch if needed
  const [users, setUsers] = useState<User[]>([]);
  
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed">("all");
  const [filterPriority, setFilterPriority] = useState<"all" | Task['priority']>("all");

  const tasksNavItem = NAV_ITEMS.find(item => item.href === '/tasks');
  const { getAllUsers, currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const fetchTasks = useCallback(async () => {
    if (!currentUser) { 
      setIsLoadingTasks(false);
      return;
    }
    setIsLoadingTasks(true);
    try {
      const tasksCollectionRef = collection(db, "tasks");
      const q = query(tasksCollectionRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedTasks = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title as string,
          description: data.description as string | undefined,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          dueDate: typeof data.dueDate === 'string' ? data.dueDate : (data.dueDate as Timestamp)?.toDate().toISOString() || undefined,
          completed: data.completed as boolean,
          relatedLeadId: data.relatedLeadId as string | undefined,
          priority: data.priority as Task['priority'] | undefined,
          assigneeUserId: data.assigneeUserId as string | undefined,
          reporterUserId: data.reporterUserId as string,
          solutionDescription: data.solutionDescription as string | undefined,
          attachments: data.attachments as string[] | undefined,
          isMonthlyRecurring: data.isMonthlyRecurring as boolean | undefined,
        } as Task;
      });
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Error al obtener tareas:", error);
      toast({
        title: "Error al Cargar Tareas",
        description: "No se pudieron cargar las tareas desde la base de datos.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTasks(false);
    }
  }, [currentUser, toast]);

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error al obtener usuarios para la página de tareas:", error);
      toast({
        title: "Error al Cargar Usuarios",
        description: "No se pudieron cargar los datos de los usuarios para la asignación de tareas.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [getAllUsers, toast]);

  useEffect(() => {
    if (!authLoading) { 
        fetchUsers();
    }
  }, [authLoading, fetchUsers]);

  useEffect(() => {
    if (!authLoading && currentUser) { 
      fetchTasks();
    } else if (!authLoading && !currentUser) { 
      setTasks([]);
      setIsLoadingTasks(false);
    }
  }, [authLoading, currentUser, fetchTasks]);


  const handleSaveTask = async (taskData: Task) => {
    if (!currentUser) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }
    setIsSubmittingTask(true);
    const isEditing = !!taskData.id && tasks.some(t => t.id === taskData.id);
    
    const taskId = taskData.id; 

    const taskToSave: Task = {
      ...taskData, 
      solutionDescription: taskData.solutionDescription || "",
      attachments: taskData.attachments || [],
      isMonthlyRecurring: taskData.isMonthlyRecurring || false,
    };
    
    try {
      const taskDocRef = doc(db, "tasks", taskId);
      const firestoreSafeTask = {
        ...taskToSave,
        createdAt: Timestamp.fromDate(new Date(taskToSave.createdAt)),
        dueDate: taskToSave.dueDate ? Timestamp.fromDate(new Date(taskToSave.dueDate)) : null,
      };
      
      await setDoc(taskDocRef, firestoreSafeTask, { merge: true }); 

      if (isEditing) {
        setTasks(prevTasks => prevTasks.map(t => t.id === taskId ? taskToSave : t)
          .sort((a, b) => Number(a.completed) - Number(b.completed) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      } else {
        setTasks(prevTasks => [taskToSave, ...prevTasks]
          .sort((a, b) => Number(a.completed) - Number(b.completed) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
      }
      toast({
        title: isEditing ? "Tarea Actualizada" : "Tarea Creada",
        description: `La tarea "${taskToSave.title}" ha sido ${isEditing ? 'actualizada' : 'creada'} exitosamente.`,
      });
      setEditingTask(null);
      setIsTaskDialogOpen(false);
    } catch (error) {
      console.error("Error al guardar tarea:", error);
      toast({
        title: "Error al Guardar Tarea",
        description: "Ocurrió un error al guardar la tarea.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleToggleComplete = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !currentUser) return;

    const updatedTask = { ...task, completed: !task.completed };
    const batch = writeBatch(db);

    try {
      const taskDocRef = doc(db, "tasks", taskId);
      batch.update(taskDocRef, { completed: updatedTask.completed });

      let newRecurringTaskInstance: Task | null = null;

      if (updatedTask.completed && task.isMonthlyRecurring) {
        const originalDueDate = task.dueDate ? new Date(task.dueDate) : new Date();
        
        let nextMonthDate = addMonths(originalDueDate, 1);
        const nextDueDate = startOfMonth(nextMonthDate);

        const newTaskId = doc(collection(db, "tasks")).id;
        newRecurringTaskInstance = {
          ...task, // Copy most fields from the original task
          id: newTaskId,
          createdAt: new Date().toISOString(),
          dueDate: nextDueDate.toISOString(),
          completed: false,
          solutionDescription: "", // Reset solution for new instance
          attachments: [], // Reset attachments for new instance
          // isMonthlyRecurring is already true from '...task'
        };
        
        const newRecurringTaskDocRef = doc(db, "tasks", newRecurringTaskInstance.id);
        const firestoreSafeNewRecurringTask = {
            ...newRecurringTaskInstance,
            createdAt: Timestamp.fromDate(new Date(newRecurringTaskInstance.createdAt)),
            dueDate: newRecurringTaskInstance.dueDate ? Timestamp.fromDate(new Date(newRecurringTaskInstance.dueDate)) : null,
        }
        batch.set(newRecurringTaskDocRef, firestoreSafeNewRecurringTask);
      }

      await batch.commit();

      setTasks(prevTasks => {
        let newTasksList = prevTasks.map(t => t.id === taskId ? updatedTask : t);
        if (newRecurringTaskInstance) {
          newTasksList = [newRecurringTaskInstance, ...newTasksList];
        }
        return newTasksList.sort((a, b) => Number(a.completed) - Number(b.completed) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });

      toast({
        title: "Tarea Actualizada",
        description: `La tarea "${task.title}" ha sido marcada como ${updatedTask.completed ? 'completada' : 'pendiente'}.`,
      });
      if (newRecurringTaskInstance) {
        toast({
          title: "Tarea Recurrente Creada",
          description: `Nueva instancia de "${newRecurringTaskInstance.title}" creada para el ${format(new Date(newRecurringTaskInstance.dueDate!), "PP", {locale: es})}.`
        });
      }

    } catch (error) {
      console.error("Error al cambiar estado de tarea completa y/o crear recurrencia:", error);
      toast({
        title: "Error al Actualizar Tarea",
        description: "No se pudo actualizar el estado de la tarea y/o crear la recurrencia.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    if (window.confirm(`¿Estás seguro de que quieres eliminar la tarea "${taskToDelete.title}"?`)) {
      try {
        // TODO: Delete attachments from Firebase Storage if any
        const taskDocRef = doc(db, "tasks", taskId);
        await deleteDoc(taskDocRef);
        setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
        toast({
          title: "Tarea Eliminada",
          description: `La tarea "${taskToDelete.title}" ha sido eliminada.`,
          variant: "destructive",
        });
      } catch (error) {
        console.error("Error al eliminar tarea:", error);
        toast({
          title: "Error al Eliminar Tarea",
          description: "Ocurrió un error al eliminar la tarea.",
          variant: "destructive",
        });
      }
    }
  };

  const filteredTasks = useMemo(() => {
    if (!currentUser) return []; 

    return tasks 
      .filter(task => { 
        if (currentUser.role === 'admin' || currentUser.role === 'supervisor') {
          return true;
        }
        return task.reporterUserId === currentUser.id || task.assigneeUserId === currentUser.id;
      })
      .filter(task => { 
        if (filterStatus === "pending") return !task.completed;
        if (filterStatus === "completed") return task.completed;
        return true;
      })
      .filter(task => { 
        if (filterPriority === "all") return true;
        return task.priority === filterPriority;
      })
      .filter(task => 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      .sort((a, b) => Number(a.completed) - Number(b.completed) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, searchTerm, filterStatus, filterPriority, currentUser]);

  const openDialogForNewTask = () => {
    setEditingTask(null); 
    setIsTaskDialogOpen(true);
  };

  const openDialogForEditTask = (task: Task) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  };

  const isLoading = authLoading || isLoadingTasks || isLoadingUsers;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{tasksNavItem ? tasksNavItem.label : "Gestión de Tareas"}</h2>
         <AddEditTaskDialog
            trigger={
              <Button onClick={openDialogForNewTask} disabled={isLoadingUsers || isSubmittingTask}>
                <PlusCircle className="mr-2 h-5 w-5" /> Añadir Tarea
              </Button>
            }
            isOpen={isTaskDialogOpen}
            onOpenChange={setIsTaskDialogOpen}
            taskToEdit={editingTask} 
            leads={leads} 
            users={users} 
            onSave={handleSaveTask}
            key={editingTask ? `edit-${editingTask.id}` : 'new-task-dialog'}
          />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar tareas..."
            className="pl-8 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterPriority} onValueChange={(value: Task['priority'] | "all") => setFilterPriority(value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar por prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las Prioridades</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as "all" | "pending" | "completed")}>
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="all">Todas las Tareas</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="completed">Completadas</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filteredTasks.length > 0 ? (
        <div className="space-y-4">
          {filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              leads={leads}
              users={users}
              onToggleComplete={handleToggleComplete}
              onEdit={() => openDialogForEditTask(task)}
              onDelete={handleDeleteTask}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-lg">No se encontraron tareas.</p>
          <p>Intenta ajustar tus filtros o añade una nueva tarea.</p>
        </div>
      )}
    </div>
  );
}
