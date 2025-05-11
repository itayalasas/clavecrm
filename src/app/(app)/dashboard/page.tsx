
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { INITIAL_LEADS, INITIAL_PIPELINE_STAGES, INITIAL_TASKS } from "@/lib/constants";
import type { Lead, PipelineStage, Task } from "@/lib/types";
import { DollarSign, Users, TrendingUp, CheckCircle2, ListTodo, Target, Activity, CalendarClock } from 'lucide-react';
import { es } from 'date-fns/locale';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getMonth, isValid } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82Ca9D'];
const MONTH_NAMES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    // In a real application, fetch this data from your backend/Firebase
    setLeads(INITIAL_LEADS);
    setStages(INITIAL_PIPELINE_STAGES);
    setTasks(INITIAL_TASKS);
  }, []);

  const totalLeads = leads.length;
  const totalValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0);
  const wonLeads = leads.filter(lead => lead.stageId === 'stage-5').length; // Assuming stage-5 is "Cerrado Ganado"
  const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
  
  const openTasks = tasks.filter(task => !task.completed).length;
  const completedTasks = tasks.filter(task => task.completed).length;

  const leadsByStageData = stages.map(stage => ({
    name: stage.name,
    leads: leads.filter(lead => lead.stageId === stage.id).length,
  }));
  
  const taskStatusData = [
    { name: 'Tareas Abiertas', value: openTasks },
    { name: 'Tareas Completadas', value: completedTasks },
  ];

  // Sales Forecast Data (weighted value by probability)
  const salesForecastData = MONTH_NAMES_ES.map((monthName, index) => {
    const forecastValue = leads.reduce((sum, lead) => {
      if (lead.expectedCloseDate && parseISO(lead.expectedCloseDate).getMonth() === index) {
        return sum + ((lead.value || 0) * (lead.probability || 0) / 100);
      }
      return sum;
    }, 0);
    return { month: monthName, forecast: Math.round(forecastValue) };
  });

  // Funnel Value by Expected Close Date
  const funnelValueByCloseDateData = leads
    .filter(lead => lead.expectedCloseDate && lead.value && lead.stageId !== 'stage-5' && lead.stageId !== 'stage-6') // Exclude won/lost
    .sort((a, b) => new Date(a.expectedCloseDate!).getTime() - new Date(b.expectedCloseDate!).getTime())
    .map(lead => ({
      date: format(parseISO(lead.expectedCloseDate!), 'dd MMM', { locale: es }),
      value: lead.value,
      name: lead.name,
    })).slice(0, 10); // Show top 10 earliest for brevity

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">+10% desde el mes pasado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor del Embudo</CardTitle>
            <DollarSign className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toLocaleString('es-ES')}</div>
            <p className="text-xs text-muted-foreground">+5.2% desde el mes pasado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Conversión</CardTitle>
            <Target className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</div>
            <p className="text-xs text-muted-foreground">+2.1% desde el mes pasado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Negocios Activos</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leads.filter(l => l.stageId !== 'stage-5' && l.stageId !== 'stage-6').length}</div>
            <p className="text-xs text-muted-foreground">Actualmente en el embudo</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pronóstico de Ventas (Ponderado)</CardTitle>
            <CardDescription>Valor estimado de cierre por mes basado en probabilidad.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesForecastData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString('es-ES')}`, "Pronóstico"]}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line type="monotone" dataKey="forecast" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads por Etapa</CardTitle>
            <CardDescription>Distribución de leads en el embudo de ventas.</CardDescription>
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
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Valor del Embudo por Fecha de Cierre</CardTitle>
            <CardDescription>Próximos cierres esperados (primeros 10).</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelValueByCloseDateData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                <YAxis type="category" dataKey="date" fontSize={12} tickLine={false} axisLine={false} width={80} />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => [`$${value.toLocaleString('es-ES')} (${props.payload.name})`, "Valor"]}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado de Tareas</CardTitle>
            <CardDescription>Resumen de tareas abiertas y completadas.</CardDescription>
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
          <CardTitle>Actividad Reciente</CardTitle>
          <CardDescription>Últimas actualizaciones e interacciones.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {tasks.slice(0,3).map(task => (
               <li key={task.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                {task.completed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <ListTodo className="h-5 w-5 text-amber-500" />}
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.relatedLeadId ? `Relacionado con ${leads.find(l => l.id === task.relatedLeadId)?.name || 'Cliente Potencial'}` : 'Tarea General'}
                    {task.dueDate && isValid(parseISO(task.dueDate)) ? ` - Vence: ${format(parseISO(task.dueDate), 'P', { locale: es})}` : ''}
                  </p>
                </div>
              </li>
            ))}
            {leads.slice(0,2).map(lead => (
              <li key={lead.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Users className="h-5 w-5 text-primary" />
                 <div>
                  <p className="text-sm font-medium">Nuevo Lead: {lead.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Agregado el {format(parseISO(lead.createdAt), 'P', { locale: es})}
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
