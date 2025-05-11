
"use client";

import type { EmailCampaign } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Edit3, Trash2, BarChart2, CalendarClock, Users, FileText as TemplateIcon } from "lucide-react";
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

interface EmailCampaignItemProps {
  campaign: EmailCampaign;
  onEdit: (campaignId: string) => void;
  onDelete: (campaignId: string) => void;
  // onViewAnalytics: (campaignId: string) => void; // Future
}

export function EmailCampaignItem({ campaign, onEdit, onDelete }: EmailCampaignItemProps) {
  
  const getStatusBadge = (status: EmailCampaign['status']) => {
    switch (status) {
      case 'Borrador': return <Badge variant="outline">{status}</Badge>;
      case 'Programada': return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">{status}</Badge>;
      case 'Enviando': return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">{status}</Badge>;
      case 'Enviada': return <Badge className="bg-green-500 hover:bg-green-600 text-white">{status}</Badge>;
      case 'Archivada': return <Badge variant="secondary">{status}</Badge>;
      case 'Fallida': return <Badge variant="destructive">{status}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <span className="truncate" title={campaign.name}>{campaign.name}</span>
          </CardTitle>
        </div>
        <CardDescription className="text-xs pt-1 line-clamp-2" title={campaign.subject}>
          Asunto: {campaign.subject}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-3 flex-grow space-y-2 text-sm">
        <div className="flex items-center justify-between">
            {getStatusBadge(campaign.status)}
            {/* Placeholder for recipient count or other key stat */}
            {/* <span className="text-xs text-muted-foreground">{campaign.analytics?.totalRecipients || 0} Destinatarios</span> */}
        </div>
        
        <div className="text-xs text-muted-foreground space-y-1">
            {campaign.scheduledAt && isValid(parseISO(campaign.scheduledAt)) && (
                <p className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Programada para: {format(parseISO(campaign.scheduledAt), "PP p", { locale: es })}</p>
            )}
            {campaign.sentAt && isValid(parseISO(campaign.sentAt)) && (
                <p className="flex items-center gap-1"><CalendarClock className="h-3 w-3 text-green-500" /> Enviada el: {format(parseISO(campaign.sentAt), "PP p", { locale: es })}</p>
            )}
             <p className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Creada: {format(parseISO(campaign.createdAt), "P", { locale: es })}</p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 pt-3 border-t">
        <Button variant="outline" size="sm" disabled> {/* onClick={() => onViewAnalytics(campaign.id)} */}
          <BarChart2 className="mr-2 h-4 w-4" /> Analíticas
        </Button>
        <Button variant="default" size="sm" onClick={() => onEdit(campaign.id)}>
          <Edit3 className="mr-2 h-4 w-4" /> Editar
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(campaign.id)}>
          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
        </Button>
      </CardFooter>
    </Card>
  );
}
