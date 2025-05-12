
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
import { BarChart2, TrendingUp, TrendingDown, AlertCircle, MailOpen, MousePointerClick, Users, Ban, ShieldX, Send as SendIcon } from "lucide-react"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell } from 'recharts';
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

  // Use campaign.analytics. If any field is undefined, default to 0 or an appropriate value.
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
    deliveryRate: campaign.analytics?.deliveryRate || 0,
    openRate: campaign.analytics?.openRate || 0,
    clickThroughRate: campaign.analytics?.clickThroughRate || 0,
    clickToOpenRate: campaign.analytics?.clickToOpenRate || 0,
    unsubscribeRate: campaign.analytics?.unsubscribeRate || 0,
    bounceRate: campaign.analytics?.bounceRate || 0,
  };
  
  const chartData = [
    { name: 'Aperturas Únicas', value: analytics.uniqueOpens, fill: CHART_COLORS[0] },
    { name: 'Clics Únicos', value: analytics.uniqueClicks, fill: CHART_COLORS[1] },
    { name: 'Rebotes', value: analytics.bounceCount, fill: CHART_COLORS[2] },
    { name: 'Desuscripciones', value: analytics.unsubscribeCount, fill: CHART_COLORS[3] },
  ].filter(item => typeof item.value === 'number' && item.value > 0); // Filter out items with 0 or undefined value

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
            <AnalyticsStatCard title="Total Destinatarios" value={analytics.totalRecipients} icon={Users} description="Contactos en la lista al enviar" />
            <AnalyticsStatCard title="Correos Enviados" value={analytics.emailsSent} icon={SendIcon} description="Intentos de envío" />
            <AnalyticsStatCard title="Tasa de Apertura" value={(analytics.openRate * 100).toFixed(1)} unit="%" icon={MailOpen} description={`${analytics.uniqueOpens} aperturas únicas`} trend={ analytics.openRate > 0.1 ? "up" : undefined}/>
            <AnalyticsStatCard title="Tasa de Clics (CTR)" value={(analytics.clickThroughRate * 100).toFixed(1)} unit="%" icon={MousePointerClick} description={`${analytics.uniqueClicks} clics únicos`} trend={ analytics.clickThroughRate > 0.02 ? "up" : undefined} />
            <AnalyticsStatCard title="Tasa de Entrega" value={(analytics.deliveryRate * 100).toFixed(1)} unit="%" icon={Users} description={`${analytics.emailsDelivered} entregados`} />
            <AnalyticsStatCard title="Rebotes" value={analytics.bounceCount} icon={Ban} description={`${(analytics.bounceRate * 100).toFixed(1)}% tasa de rebote`} trend={analytics.bounceCount > 5 ? "down" : undefined} />
          </div>

         {chartData.length > 0 ? (
            <Card>
                <CardHeader>
                <CardTitle>Visión General del Rendimiento</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend wrapperStyle={{fontSize: '12px'}}/>
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                    </BarChart>
                </ResponsiveContainer>
                </CardContent>
            </Card>
          ) : (
            <Card className="bg-muted/30">
                 <CardContent className="pt-6 text-center text-muted-foreground">
                    <BarChart2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p>No hay suficientes datos para mostrar el gráfico de rendimiento detallado.</p>
                    <p className="text-xs">Esto puede ocurrir si la campaña aún no se ha enviado o no se han registrado interacciones.</p>
                </CardContent>
            </Card>
          )}
          
          <Card className="bg-muted/50">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500"/>Notas sobre Analíticas</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>Las analíticas de apertura y clics dependen de que los clientes de correo de los destinatarios carguen imágenes y permitan el seguimiento. Esto es una limitación técnica común.</p>
                <p>Los datos mostrados pueden tener un pequeño retraso y son aproximados.</p>
                <p>La funcionalidad completa de seguimiento (píxeles de apertura, redirección de clics) requiere infraestructura de backend y webhooks con el proveedor SMTP, lo cual está planeado para futuras versiones.</p>
                <p>Actualmente, solo se registra el recuento de envíos exitosos desde la función de Cloud.</p>
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
