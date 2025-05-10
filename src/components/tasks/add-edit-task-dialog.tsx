"use client";

import { useState, useEffect } from "react";
import type { Task, Lead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface AddEditTaskDialogProps {
  trigger: React.ReactNode;
  taskToEdit?: Task | null;
  leads: Lead[];
  onSave: (task: Task) => void;
}

const defaultTask: Omit<Task, 'id' | 'createdAt'> = {
  title: "",
  description: "",
  dueDate: undefined,
  completed: false,
  relatedLeadId: undefined,
  priority: 'medium',
};

export function AddEditTaskDialog({ trigger, taskToEdit, leads, onSave }: AddEditTaskDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Omit<Task, 'id' | 'createdAt'>>(defaultTask);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (taskToEdit) {
      setFormData({
        title: taskToEdit.title,
        description: taskToEdit.description || "",
        dueDate: taskToEdit.dueDate,
        completed: taskToEdit.completed,
        relatedLeadId: taskToEdit.relatedLeadId || undefined,
        priority: taskToEdit.priority || 'medium',
      });
      setSelectedDate(taskToEdit.dueDate ? parseISO(taskToEdit.dueDate) : undefined);
    } else {
      setFormData(defaultTask);
      setSelectedDate(undefined);
    }
  }, [taskToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: 'relatedLeadId' | 'priority', value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value || undefined }));
  };

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setFormData((prev) => ({ ...prev, dueDate: date ? date.toISOString() : undefined }));
  };

  const handleSubmit = () => {
    if (!formData.title) {
      alert("Title is required."); // Basic validation
      return;
    }
    const newTask: Task = {
      ...formData,
      id: taskToEdit ? taskToEdit.id : `task-${Date.now()}`,
      createdAt: taskToEdit ? taskToEdit.createdAt : new Date().toISOString(),
    };
    onSave(newTask);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{taskToEdit ? "Edit Task" : "Add New Task"}</DialogTitle>
          <DialogDescription>
            {taskToEdit ? "Update the details for this task." : "Fill in the information for the new task."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">Title</Label>
            <Input id="title" name="title" value={formData.title} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right pt-2">Description</Label>
            <Textarea id="description" name="description" value={formData.description} onChange={handleChange} className="col-span-3" rows={3} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="dueDate" className="text-right">Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "col-span-3 justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="priority" className="text-right">Priority</Label>
            <Select name="priority" value={formData.priority} onValueChange={(value) => handleSelectChange('priority', value)}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="relatedLeadId" className="text-right">Related Lead</Label>
            <Select name="relatedLeadId" value={formData.relatedLeadId} onValueChange={(value) => handleSelectChange('relatedLeadId', value)}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a lead (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button type="submit" onClick={handleSubmit}>Save Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
