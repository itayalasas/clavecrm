"use client";

import { useState, useEffect, useMemo } from "react";
import type { Task, Lead } from "@/lib/types";
import { INITIAL_TASKS, INITIAL_LEADS } from "@/lib/constants";
import { TaskItem } from "@/components/tasks/task-item";
import { AddEditTaskDialog } from "@/components/tasks/add-edit-task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, Filter } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed">("all");
  const [filterPriority, setFilterPriority] = useState<"all" | Task['priority']>("all");

  useEffect(() => {
    // Simulate fetching data
    setTasks(INITIAL_TASKS);
    setLeads(INITIAL_LEADS);
  }, []);

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
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) // Sort by creation date desc
      .sort((a,b) => Number(a.completed) - Number(b.completed)); // Keep completed tasks at bottom
  }, [tasks, searchTerm, filterStatus, filterPriority]);
  
  const openDialogForNewTask = () => {
    setEditingTask(null); // Ensure it's a new task
    // The dialog should have its own open state managed by its trigger
  };


  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Task Management</h2>
        <AddEditTaskDialog
            trigger={
              <Button onClick={openDialogForNewTask}>
                <PlusCircle className="mr-2 h-5 w-5" /> Add Task
              </Button>
            }
            taskToEdit={editingTask} // This will be null for new task
            leads={leads}
            onSave={handleSaveTask}
          />
        {editingTask && ( // This is for editing, ensures dialog opens if editingTask is set
          <AddEditTaskDialog
            trigger={<span className="hidden" />} // Hidden trigger
            taskToEdit={editingTask}
            leads={leads}
            onSave={handleSaveTask}
          />
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tasks..."
            className="pl-8 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterPriority} onValueChange={(value: Task['priority'] | "all") => setFilterPriority(value)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as "all" | "pending" | "completed")}>
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="all">All Tasks</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredTasks.length > 0 ? (
        <div className="space-y-4">
          {filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              leads={leads}
              onToggleComplete={handleToggleComplete}
              onEdit={() => setEditingTask(task)}
              onDelete={handleDeleteTask}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-lg">No tasks found.</p>
          <p>Try adjusting your filters or add a new task.</p>
        </div>
      )}
    </div>
  );
}
