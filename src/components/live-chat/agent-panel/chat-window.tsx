"use client";

import { useState, useEffect, useRef } from "react";
import type { ChatSession, ChatMessage, User, Lead, Ticket } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, XCircle, Users, Info, MessageSquareDashed, Loader2, LogOut, ArrowLeftCircle, History } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { VisitorInfo } from "./visitor-info";
import { CannedResponses } from "./canned-responses";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  session: ChatSession;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoadingMessages: boolean;
  currentAgent: { id: string; name: string; avatarUrl?: string | null } | null;
  onCloseChat: () => void; 
  isReadOnly?: boolean; 
  onOpenCreateLeadDialog: (session: ChatSession) => void;
  onOpenCreateTicketDialog: (session: ChatSession) => void;
  onOpenLinkEntityDialog: (session: ChatSession) => void;
  linkedLead: Lead | null;
  linkedTicket: Ticket | null;
}

export function ChatWindow({
  session,
  messages,
  onSendMessage,
  isLoadingMessages,
  currentAgent,
  onCloseChat,
  isReadOnly = false,
  onOpenCreateLeadDialog,
  onOpenCreateTicketDialog,
  onOpenLinkEntityDialog,
  linkedLead,
  linkedTicket,
}: ChatWindowProps) {
  const [newMessage, setNewMessage] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && !isReadOnly) {
      onSendMessage(newMessage.trim());
      setNewMessage("");
    }
  };

  const getSenderName = (senderId: string, senderType: 'visitor' | 'agent') => {
    if (senderType === 'visitor') return session.visitorName || `Visitante ${senderId.substring(0,6)}`;
    if (senderType === 'agent') {
        if (currentAgent?.id === senderId) return currentAgent.name;
        return "Agente"; 
    }
    return "Desconocido";
  };

  const getSenderAvatar = (senderId: string, senderType: 'visitor' | 'agent') => {
    if (senderType === 'visitor') return `https://avatar.vercel.sh/${senderId}.png?size=32`;
    if (senderType === 'agent') {
        if (currentAgent?.id === senderId && currentAgent.avatarUrl) return currentAgent.avatarUrl;
        return `https://avatar.vercel.sh/${getSenderName(senderId, senderType)}.png?size=32`; 
    }
    return `https://avatar.vercel.sh/unknown.png?size=32`;
  };
   const getSenderAvatarFallback = (senderId: string, senderType: 'visitor' | 'agent') => {
    const name = getSenderName(senderId, senderType);
    return name.substring(0,1).toUpperCase();
  }


  return (
    <div className="flex flex-col h-full">
      <CardHeader className="p-3 border-b flex-row items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={`https://avatar.vercel.sh/${session.visitorId}.png?size=40`} alt={session.visitorName || "Visitante"} data-ai-hint="visitor avatar"/>
            <AvatarFallback>{(session.visitorName || "V").substring(0,1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">
              {isReadOnly && <History className="inline h-4 w-4 mr-1.5 text-muted-foreground" />}
              {session.visitorName || `Visitante ${session.visitorId.substring(0,6)}`}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
                {isReadOnly ? `Transcripción - ID: ${session.id.substring(0,8)}...` : `ID Sesión: ${session.id.substring(0,8)}...`}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {isReadOnly ? (
             <Button variant="outline" size="sm" onClick={onCloseChat}>
                <ArrowLeftCircle className="mr-1 h-4 w-4" /> Volver al Historial
            </Button>
          ) : (
            <>
                <Button variant="outline" size="sm" onClick={onCloseChat} disabled={session.status === 'closed'}>
                    <XCircle className="mr-1 h-4 w-4" /> Cerrar Chat
                </Button>
                <Button variant="outline" size="sm" disabled>
                    <LogOut className="mr-1 h-4 w-4" /> Transferir
                </Button>
            </>
          )}
        </div>
      </CardHeader>

      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 overflow-hidden">
        <ScrollArea ref={scrollAreaRef} className="lg:col-span-3 h-full p-4 space-y-3 bg-muted/20">
          {isLoadingMessages ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
                <MessageSquareDashed size={40} className="mb-3 text-gray-400" />
                <p className="text-sm">{isReadOnly ? "No hay mensajes en esta conversación." : "Aún no hay mensajes en este chat."}</p>
                {!isReadOnly && session.status === 'pending' && session.agentId !== currentAgent?.id && <p className="text-xs mt-1">Esperando que un agente se una...</p>}
             </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-end gap-2",
                  msg.senderType === 'agent' ? "justify-end" : "justify-start"
                )}
              >
                {msg.senderType === 'visitor' && (
                  <Avatar className="h-7 w-7 self-start">
                    <AvatarImage src={getSenderAvatar(msg.senderId, msg.senderType)} alt={getSenderName(msg.senderId, msg.senderType)} data-ai-hint="visitor chat avatar"/>
                    <AvatarFallback>{getSenderAvatarFallback(msg.senderId, msg.senderType)}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "p-2.5 rounded-lg max-w-[70%] text-sm shadow-sm",
                    msg.senderType === 'agent'
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-background border rounded-bl-none"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                   <p className={cn(
                       "text-xs mt-1",
                       msg.senderType === 'agent' ? "text-primary-foreground/70 text-right" : "text-muted-foreground/80 text-left"
                    )}>
                        {format(new Date(msg.timestamp), "p", { locale: es })}
                    </p>
                </div>
                 {msg.senderType === 'agent' && (
                  <Avatar className="h-7 w-7 self-start">
                    <AvatarImage src={getSenderAvatar(msg.senderId, msg.senderType)} alt={getSenderName(msg.senderId, msg.senderType)} data-ai-hint="agent chat avatar" />
                     <AvatarFallback>{getSenderAvatarFallback(msg.senderId, msg.senderType)}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))
          )}
        </ScrollArea>
        
        <div className="hidden lg:flex lg:flex-col lg:col-span-1 border-l p-3 space-y-3 bg-background">
            <VisitorInfo 
                session={session} 
                onOpenCreateLeadDialog={onOpenCreateLeadDialog}
                onOpenCreateTicketDialog={onOpenCreateTicketDialog}
                onOpenLinkEntityDialog={onOpenLinkEntityDialog}
                linkedLead={linkedLead}
                linkedTicket={linkedTicket}
            />
            <Separator />
            {!isReadOnly && <CannedResponses onSelectResponse={(text) => setNewMessage(prev => prev + text)} />}
        </div>
      </div>


      <CardFooter className="p-3 border-t shrink-0">
        <form onSubmit={handleSend} className="flex w-full items-center gap-2">
          <Input
            type="text"
            placeholder={isReadOnly ? "Transcripción (solo lectura)." : (session.status === 'closed' ? "Chat cerrado." : "Escribe un mensaje...")}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isReadOnly || session.status === 'closed' || (session.status === 'pending' && session.agentId !== currentAgent?.id)}
            className="flex-grow"
          />
          <Button type="submit" disabled={isReadOnly || !newMessage.trim() || session.status === 'closed' || (session.status === 'pending' && session.agentId !== currentAgent?.id)}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Enviar</span>
          </Button>
        </form>
      </CardFooter>
    </div>
  );
}
