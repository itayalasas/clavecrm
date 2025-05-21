
"use client";

import type { EmailCampaign, EmailCampaignAnalytics } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BarChart2, TrendingUp, TrendingDown, AlertCircle, MailOpen, MousePointerClick, Users, Ban, ShieldX, Send as SendIcon, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription as CardDescriptionUI } from "@/components/ui/card"; // Renamed CardDescription
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, PieChart, Pie, LabelList } from 'recharts'; // Added PieChart, Pie
import { ScrollArea } from "../ui/scroll-area";

interface EmailCampaignAnalyticsDialogProps {
  campaign: EmailCampaign | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const AnalyticsStatCard = ({ title, value, icon: Icon, trend, description, unit = "" }: { title: string, value: number | string, icon: React.ElementType, trend?: "up" | "down", description?: string, unit?: string }) => (
  <Card className="shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}{unit}</div>
      {description && (
        <p className="text-xs text-muted-foreground flex items-center">
          {trend === "up" && <TrendingUp className="h-3 w-3 mr-1 text-green-500" />}
          {trend === "down" && <TrendingDown className="h-3 w-3 mr-1 text-red-500" />}
          {description}
        </p>
      )}
    </CardContent>
  </Card>
);


export function EmailCampaignAnalyticsDialog({ campaign, isOpen, onOpenChange }: EmailCampaignAnalyticsDialogProps) {
  if (!campaign) return null;

  const analytics: EmailCampaignAnalytics = {
    totalRecipients: campaign.analytics?.totalRecipients || 0,
    emailsSent: campaign.analytics?.emailsSent || 0,
    emailsDelivered: campaign.analytics?.emailsDelivered || 0,
    emailsOpened: campaign.analytics?.emailsOpened || 0,
    uniqueOpens: campaign.analytics?.uniqueOpens || 0,
    emailsClicked: campaign.analytics?.emailsClicked || 0,
    uniqueClicks: campaign.analytics?.uniqueClicks || 0,
    bounceCount: campaign.analytics?.bounceCount || 0,
    unsubscribeCount: campaign.analytics?.unsubscribeCount || 0,
    spamReports: campaign.analytics?.spamReports || 0,
    deliveryRate: campaign.analytics?.deliveryRate || (analytics.emailsSent > 0 ? (analytics.emailsDelivered || 0) / analytics.emailsSent : 0),
    openRate: campaign.analytics?.openRate || (analytics.emailsDelivered > 0 ? (analytics.uniqueOpens || 0) / analytics.emailsDelivered : 0),
    clickThroughRate: campaign.analytics?.clickThroughRate || (analytics.emailsDelivered > 0 ? (analytics.uniqueClicks || 0) / analytics.emailsDelivered : 0),
    clickToOpenRate: campaign.analytics?.clickToOpenRate || (analytics.uniqueOpens > 0 ? (analytics.uniqueClicks || 0) / analytics.uniqueOpens : 0),
    unsubscribeRate: campaign.analytics?.unsubscribeRate || (analytics.emailsSent > 0 ? (analytics.unsubscribeCount || 0) / analytics.emailsSent : 0),
    bounceRate: campaign.analytics?.bounceRate || (analytics.emailsSent > 0 ? (analytics.bounceCount || 0) / analytics.emailsSent : 0),
  };

  const basicPerformanceData = [
    { name: 'Enviados', value: analytics.emailsSent, fill: CHART_COLORS[0] },
    { name: 'Entregados (Próx.)', value: analytics.emailsDelivered || 0, fill: CHART_COLORS[1] },
    { name: 'Aperturas Únicas (Próx.)', value: analytics.uniqueOpens || 0, fill: CHART_COLORS[2] },
    { name: 'Clics Únicos (Próx.)', value: analytics.uniqueClicks || 0, fill: CHART_COLORS[3] },
  ].filter(item => typeof item.value === 'number');

  const issuesData = [
    { name: 'Rebotes (Próx.)', value: analytics.bounceCount || 0, fill: CHART_COLORS[2] },
    { name: 'Desuscripciones (Próx.)', value: analytics.unsubscribeCount || 0, fill: CHART_COLORS[3] },
    { name: 'Reportes Spam (Próx.)', value: analytics.spamReports || 0, fill: CHART_COLORS[4] },
  ].filter(item => typeof item.value === 'number' && item.value > 0);


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <BarChart2 className="h-5 w-5 text-primary" />
            Analíticas de la Campaña: {campaign.name}
          </DialogTitle>
          <DialogDescription>
            Resultados y rendimiento de la campaña &quot;{campaign.subject}&quot;. (Estado: {campaign.status})
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] p-1">
        <div className="space-y-6 py-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnalyticsStatCard title="Total Destinatarios" value={analytics.totalRecipients} icon={Users} description="Contactos en la lista" />
            <AnalyticsStatCard title="Correos Enviados" value={analytics.emailsSent} icon={SendIcon} description="Intentos de envío registrados por el sistema" />
            <AnalyticsStatCard title="Tasa de Entrega (Próx.)" value={(analytics.deliveryRate * 100).toFixed(1)} unit="%" icon={Users} description={`${analytics.emailsDelivered || 0} entregados (estimado)`} />
            <AnalyticsStatCard title="Tasa de Apertura (Próx.)" value={(analytics.openRate * 100).toFixed(1)} unit="%" icon={MailOpen} description={`${analytics.uniqueOpens || 0} aperturas únicas (estimado)`} trend={ analytics.openRate > 0.1 ? "up" : undefined}/>
            <AnalyticsStatCard title="Tasa de Clics (CTR) (Próx.)" value={(analytics.clickThroughRate * 100).toFixed(1)} unit="%" icon={MousePointerClick} description={`${analytics.uniqueClicks || 0} clics únicos (estimado)`} trend={ analytics.clickThroughRate > 0.02 ? "up" : undefined} />
            <AnalyticsStatCard title="Rebotes (Próx.)" value={analytics.bounceCount || 0} icon={Ban} description={`${(analytics.bounceRate * 100).toFixed(1)}% tasa de rebote (estimado)`} trend={(analytics.bounceCount || 0) > (analytics.emailsSent * 0.05) ? "down" : undefined} />
          </div>

         {basicPerformanceData.filter(d => d.value > 0).length > 0 ? (
            <Card>
                <CardHeader>
                  <CardTitleUI>Visión General del Rendimiento</CardTitleUI>
                </CardHeader>
                <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={basicPerformanceData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={50} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend wrapperStyle={{fontSize: '12px'}}/>
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {basicPerformanceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                        <LabelList dataKey="value" position="top" fontSize={10} />
                    </Bar>
                    </BarChart>
                </ResponsiveContainer>
                </CardContent>
            </Card>
          ) : (
            <Card className="bg-muted/30">
                 <CardContent className="pt-6 text-center text-muted-foreground">
                    <BarChart2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p>No hay suficientes datos para mostrar el gráfico de rendimiento.</p>
                    <p className="text-xs">Los datos de entrega, aperturas y clics se actualizarán cuando se configure el seguimiento con webhooks.</p>
                </CardContent>
            </Card>
          )}

           {issuesData.length > 0 && (
            <Card>
                <CardHeader>
                <CardTitleUI>Problemas de Entrega (Estimado)</CardTitleUI>
                </CardHeader>
                <CardContent className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                    <Pie data={issuesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                        {issuesData.map((entry, index) => (
                            <Cell key={`cell-issue-${index}`} fill={entry.fill} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend wrapperStyle={{fontSize: '11px'}}/>
                    </PieChart>
                </ResponsiveContainer>
                </CardContent>
            </Card>
          )}
          
          <Card className="bg-muted/50">
            <CardHeader>
                <CardTitleUI className="text-base flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500"/>Notas sobre Analíticas</CardTitleUI>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>Las analíticas de entrega, apertura y clics dependen de la configuración de webhooks con tu proveedor de servicios de correo (ESP) o una solución de seguimiento personalizada. Esta integración está marcada como <strong className="text-amber-600">Próximamente</strong>.</p>
                <p>Los datos de "Correos Enviados" y "Total Destinatarios" se basan en la información procesada por la Cloud Function al momento del envío.</p>
                <p>Las métricas de apertura y clics son estimaciones basadas en las mejores prácticas de la industria y pueden no ser 100% precisas debido a bloqueadores de imágenes y configuraciones de privacidad del usuario.</p>
            </CardContent>
          </Card>

        </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
