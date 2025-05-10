"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { INITIAL_LEADS, INITIAL_PIPELINE_STAGES, INITIAL_TASKS } from "@/lib/constants";
import type { Lead, PipelineStage, Task } from "@/lib/types";
import { DollarSign, Users, TrendingUp, CheckCircle2, ListTodo, Target } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82Ca9D'];

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    // Simulate data fetching
    setLeads(INITIAL_LEADS);
    setStages(INITIAL_PIPELINE_STAGES);
    setTasks(INITIAL_TASKS);
  }, []);

  const totalLeads = leads.length;
  const totalValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);
  const wonLeads = leads.filter(lead => lead.stageId === 'stage-5').length;
  const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
  
  const openTasks = tasks.filter(task => !task.completed).length;
  const completedTasks = tasks.filter(task => task.completed).length;

  const leadsByStageData = stages.map(stage => ({
    name: stage.name,
    leads: leads.filter(lead => lead.stageId === stage.id).length,
  }));

  const salesPerformanceData = [
    { month: 'Jan', sales: Math.floor(Math.random() * 5000) + 1000 },
    { month: 'Feb', sales: Math.floor(Math.random() * 5000) + 1000 },
    { month: 'Mar', sales: Math.floor(Math.random() * 5000) + 1000 },
    { month: 'Apr', sales: Math.floor(Math.random() * 5000) + 1000 },
    { month: 'May', sales: Math.floor(Math.random() * 5000) + 1000 },
    { month: 'Jun', sales: Math.floor(Math.random() * 5000) + 1000 },
  ];
  
  const taskStatusData = [
    { name: 'Open Tasks', value: openTasks },
    { name: 'Completed Tasks', value: completedTasks },
  ];


  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">+10% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+5.2% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">+2.1% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leads.filter(l => l.stageId !== 'stage-5' && l.stageId !== 'stage-6').length}</div>
            <p className="text-xs text-muted-foreground">Currently in pipeline</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by Stage</CardTitle>
            <CardDescription>Distribution of leads across sales pipeline stages.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadsByStageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Status</CardTitle>
            <CardDescription>Overview of open and completed tasks.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={taskStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {taskStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
            </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest updates and interactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {tasks.slice(0,3).map(task => (
               <li key={task.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                {task.completed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <ListTodo className="h-5 w-5 text-amber-500" />}
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.relatedLeadId ? `Related to ${leads.find(l => l.id === task.relatedLeadId)?.name || 'Lead'}` : 'General Task'}
                    {task.dueDate ? ` - Due: ${new Date(task.dueDate).toLocaleDateString()}` : ''}
                  </p>
                </div>
              </li>
            ))}
            {leads.slice(0,2).map(lead => (
              <li key={lead.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Users className="h-5 w-5 text-primary" />
                 <div>
                  <p className="text-sm font-medium">New Lead: {lead.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Added on {new Date(lead.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
