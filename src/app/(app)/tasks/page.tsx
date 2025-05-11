
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Task, Lead, User } from "@/lib/types";
import { INITIAL_TASKS, INITIAL_LEADS, NAV_ITEMS } from "@/lib/constants";
import { TaskItem } from "@/components/tasks/task-item";
import { AddEditTaskDialog } from "@/components/tasks/add-edit-task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed">("all");
  const [filterPriority, setFilterPriority] = useState<"all" | Task['priority']>("all");

  const tasksNavItem = NAV_ITEMS.find(item => item.href === '/tasks');
  const { getAllUsers } = useAuth();
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users for tasks page:", error);
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
    // Simulate fetching tasks and leads (can be replaced with actual API calls)
    setTasks(INITIAL_TASKS);
    setLeads(INITIAL_LEADS);
    fetchUsers();
  }, [fetchUsers]);

  const handleSaveTask = (task: Task) => {
    setTasks(prevTasks => {
      const existingTaskIndex = prevTasks.findIndex(t => t.id === task.id);
      if (existingTaskIndex > -1) {
        const updatedTasks = [...prevTasks];
        updatedTasks[existingTaskIndex] = task;
        return updatedTasks;
      }
      return [task, ...prevTasks]; // Add new tasks to the top
    });
    setEditingTask(null);
  };

  const handleToggleComplete = (taskId: string) => {
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
  };

  const filteredTasks = useMemo(() => {
    return tasks
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
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .sort((a,b) => Number(a.completed) - Number(b.completed));
  }, [tasks, searchTerm, filterStatus, filterPriority]);

  const openDialogForNewTask = () => {
    setEditingTask(null);
  };


  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{tasksNavItem ? tasksNavItem.label : "Gestión de Tareas"}</h2>
        <AddEditTaskDialog
            trigger={
              <Button onClick={openDialogForNewTask} disabled={isLoadingUsers}>
                <PlusCircle className="mr-2 h-5 w-5" /> Añadir Tarea
              </Button>
            }
            taskToEdit={editingTask}
            leads={leads}
            users={users}
            onSave={handleSaveTask}
          />
        {editingTask && (
          <AddEditTaskDialog
            trigger={<span className="hidden" />}
            taskToEdit={editingTask}
            leads={leads}
            users={users}
            onSave={handleSaveTask}
          />
        )}
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

      {isLoadingUsers ? (
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
              onEdit={() => setEditingTask(task)}
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
