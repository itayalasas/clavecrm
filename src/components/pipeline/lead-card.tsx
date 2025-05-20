
"use client";

import type { Lead } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DollarSign, Edit3, Mail, Phone, MoreVertical, Star, Percent, CalendarClock, PhoneCall } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { getUserInitials } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast"; // Import useToast

interface LeadCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
}

export function LeadCard({ lead, onEdit }: LeadCardProps) {
  const avatarFallback = getUserInitials(lead.name);
  const { toast } = useToast(); // Initialize useToast

  const handleSimulatedCall = () => {
    if (lead.phone) {
      toast({
        title: "Simulando Llamada...",
        description: `Llamando a ${lead.name} al ${lead.phone}. (Integración con telefonía pendiente)`,
      });
      // Aquí iría la lógica real de Clic-to-Call en el futuro
    } else {
      toast({
        title: "Número de Teléfono Faltante",
        description: `El lead ${lead.name} no tiene un número de teléfono registrado.`,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="mb-4 shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={`https://avatar.vercel.sh/${lead.email || lead.name}.png`} alt={lead.name} data-ai-hint="company logo"/>
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{lead.name}</CardTitle>
              {lead.company && <CardDescription className="text-sm">{lead.company}</CardDescription>}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(lead)}>
                <Edit3 className="mr-2 h-4 w-4" />
                Editar Lead
              </DropdownMenuItem>
              {lead.email && (
                <DropdownMenuItem onClick={() => window.location.href = `mailto:${lead.email}`}>
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar Correo
                </DropdownMenuItem>
              )}
              {lead.phone && (
                <DropdownMenuItem onClick={handleSimulatedCall}>
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Llamar (Simulado)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {lead.details && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{lead.details}</p>}
        
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {lead.email && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
                    <Mail className="h-3 w-3" /> 
                    <span className="truncate max-w-[150px]">{lead.email}</span>
                  </a>
                </TooltipTrigger>
                <TooltipContent><p>{lead.email}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {lead.phone && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {lead.phone}
                  </span>
                </TooltipTrigger>
                <TooltipContent><p>{lead.phone}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center mt-2 text-xs">
           {typeof lead.score === 'number' && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {lead.score}/100
                  </span>
                </TooltipTrigger>
                <TooltipContent><p>Puntuación del Lead</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {typeof lead.probability === 'number' && (
             <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-blue-600 font-medium">
                    <Percent className="h-3 w-3" /> {lead.probability}%
                  </span>
                </TooltipTrigger>
                <TooltipContent><p>Probabilidad de Cierre</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {lead.expectedCloseDate && isValid(parseISO(lead.expectedCloseDate)) && (
             <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <CalendarClock className="h-3 w-3" /> {format(parseISO(lead.expectedCloseDate), "P", { locale: es })}
                    </span>
                    </TooltipTrigger>
                    <TooltipContent><p>Fecha de Cierre Estimada</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
          )}
        </div>

      </CardContent>
      <CardFooter className="p-4 flex justify-between items-center text-sm border-t">
        {typeof lead.value === 'number' && lead.value > 0 ? (
          <div className="flex items-center font-semibold text-primary">
            <DollarSign className="h-4 w-4 mr-1" />
            {lead.value.toLocaleString('es-ES', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
          </div>
        ) : <div />}
        <span className="text-xs text-muted-foreground">
          Agregado: {new Date(lead.createdAt).toLocaleDateString('es-ES')}
        </span>
      </CardFooter>
    </Card>
  );
}
