"use client";

import type { Lead } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DollarSign, Edit3, Mail, Phone, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LeadCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
}

export function LeadCard({ lead, onEdit }: LeadCardProps) {
  const avatarFallback = lead.name.substring(0, 2).toUpperCase();
  return (
    <Card className="mb-4 shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={`https://picsum.photos/seed/${lead.id}/100/100`} alt={lead.name} data-ai-hint="company logo"/>
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
              <DropdownMenuItem>
                <Mail className="mr-2 h-4 w-4" />
                Enviar Correo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {lead.details && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{lead.details}</p>}
        <div className="flex items-center text-sm text-muted-foreground gap-2 mb-1">
          {lead.email && (
            <div className="flex items-center gap-1">
              <Mail className="h-4 w-4" /> 
              <a href={`mailto:${lead.email}`} className="hover:text-primary transition-colors">{lead.email}</a>
            </div>
          )}
        </div>
        <div className="flex items-center text-sm text-muted-foreground gap-2">
          {lead.phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-4 w-4" />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-4 flex justify-between items-center text-sm">
        {lead.value && (
          <div className="flex items-center font-semibold text-primary">
            <DollarSign className="h-4 w-4 mr-1" />
            {lead.value.toLocaleString('es-ES')}
          </div>
        )}
        <span className="text-xs text-muted-foreground">
          Agregado: {new Date(lead.createdAt).toLocaleDateString('es-ES')}
        </span>
      </CardFooter>
    </Card>
  );
}
