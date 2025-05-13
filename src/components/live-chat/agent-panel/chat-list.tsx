"use client";

import type { ChatSession } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { UserCheck, MessagesSquare, History } from "lucide-react";

interface ChatListProps {
  sessions: ChatSession[];
  selectedSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  isLoading: boolean;
  currentAgentId: string | null;
  isHistoryList?: boolean; // New prop
}

export function ChatList({ sessions, selectedSessionId, onSelectSession, isLoading, currentAgentId, isHistoryList = false }: ChatListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3 p-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
        {isHistoryList ? <History size={32} className="mb-2" /> : <MessagesSquare size={32} className="mb-2" />}
        <p className="text-sm">
          {isHistoryList ? "No hay chats en el historial." : "No hay conversaciones activas o pendientes."}
        </p>
        <p className="text-xs">
          {isHistoryList ? "Los chats cerrados aparecerán aquí." : "Nuevos chats aparecerán aquí."}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1">
        {sessions.map((session) => (
          <Button
            key={session.id}
            variant="ghost"
            className={cn(
              "w-full h-auto justify-start p-2 text-left",
              selectedSessionId === session.id && "bg-accent text-accent-foreground"
            )}
            onClick={() => onSelectSession(session)}
          >
            <Avatar className="h-9 w-9 mr-3">
              <AvatarImage src={`https://avatar.vercel.sh/${session.visitorId}.png?size=40`} alt={session.visitorName || "Visitante"} data-ai-hint="visitor avatar" />
              <AvatarFallback>{(session.visitorName || "V").substring(0,1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-grow min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium truncate">{session.visitorName || `Visitante ${session.visitorId.substring(0,6)}`}</p>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {formatDistanceToNowStrict(new Date(session.lastMessageAt), { addSuffix: true, locale: es })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                {session.status === 'pending' && !isHistoryList ? (
                  <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">Pendiente</Badge>
                ) : session.agentId === currentAgentId && !isHistoryList ? (
                  <Badge variant="default" className="text-xs bg-green-500 hover:bg-green-600">Asignado a ti</Badge>
                ) : session.agentId && !isHistoryList ? (
                   <Badge variant="secondary" className="text-xs">Asignado</Badge>
                ) : session.status === 'closed' ? (
                    <Badge variant="outline" className="text-xs">Cerrado</Badge>
                ) : (
                    <Badge variant="outline" className="text-xs">{session.status}</Badge>
                )}
                {session.initialMessage && <p className="text-xs text-muted-foreground truncate">{session.initialMessage.substring(0,25)}...</p>}
              </div>
            </div>
          </Button>
        ))}
      </div>
    </ScrollArea>
  );
}
