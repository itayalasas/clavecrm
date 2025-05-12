"use client";

import { useState, useEffect } from "react";
import { ChatList } from "@/components/live-chat/agent-panel/chat-list";
import { ChatWindow } from "@/components/live-chat/agent-panel/chat-window";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { LayoutGrid, MessageSquare } from "lucide-react";
import type { ChatSession, ChatMessage } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function AgentPanelPage() {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const { currentUser } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!currentUser) return;
    setIsLoadingSessions(true);
    const q = query(
      collection(db, "chatSessions"),
      where("status", "in", ["pending", "active"]), // Only show pending or active chats
      orderBy("lastMessageAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          lastMessageAt: (data.lastMessageAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        } as ChatSession
      });
      setChatSessions(sessions);
      setIsLoadingSessions(false);
    }, (error) => {
      console.error("Error fetching chat sessions: ", error);
      toast({ title: "Error al cargar chats", description: "No se pudieron obtener las sesiones de chat.", variant: "destructive" });
      setIsLoadingSessions(false);
    });
    return () => unsubscribe();
  }, [currentUser, toast]);


  useEffect(() => {
    if (selectedSession?.id && currentUser) {
      setIsLoadingMessages(true);
      const messagesQuery = query(
        collection(db, `chatSessions/${selectedSession.id}/messages`),
        orderBy("timestamp", "asc")
      );
      const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        const fetchedMessages = snapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                timestamp: (data.timestamp as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
            } as ChatMessage
        });
        setMessages(fetchedMessages);
        setIsLoadingMessages(false);
      }, (error) => {
        console.error(`Error fetching messages for session ${selectedSession.id}: `, error);
        toast({ title: "Error al cargar mensajes", description: "No se pudieron obtener los mensajes del chat.", variant: "destructive" });
        setIsLoadingMessages(false);
      });
      return () => unsubscribeMessages();
    } else {
      setMessages([]);
    }
  }, [selectedSession, currentUser, toast]);


  const handleSelectSession = async (session: ChatSession) => {
    setSelectedSession(session);
    // If session is pending and current user is an agent, assign it
    if (session.status === 'pending' && currentUser && currentUser.role !== 'user') { // Assuming non-'user' roles can be agents
      try {
        await updateDoc(doc(db, "chatSessions", session.id), {
          agentId: currentUser.id,
          status: "active",
          lastMessageAt: serverTimestamp() // Update timestamp to bring to top or sort correctly
        });
        toast({ title: "Chat Asignado", description: `Te has asignado al chat con ${session.visitorName || session.visitorId}` });
      } catch (error) {
        console.error("Error assigning chat:", error);
        toast({ title: "Error al asignar chat", variant: "destructive" });
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedSession || !currentUser || !text.trim()) return;
    try {
      await addDoc(collection(db, `chatSessions/${selectedSession.id}/messages`), {
        sessionId: selectedSession.id,
        senderId: currentUser.id,
        senderName: currentUser.name, // Store sender name for display
        senderType: "agent",
        text: text.trim(),
        timestamp: serverTimestamp()
      });
      await updateDoc(doc(db, "chatSessions", selectedSession.id), {
        lastMessageAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Error al enviar mensaje", variant: "destructive"});
    }
  };
  
  const handleCloseChat = async () => {
    if (!selectedSession) return;
    try {
      await updateDoc(doc(db, "chatSessions", selectedSession.id), {
        status: "closed",
        lastMessageAt: serverTimestamp()
      });
      toast({ title: "Chat Cerrado", description: `La conversación con ${selectedSession.visitorName || selectedSession.visitorId} ha sido cerrada.`});
      setSelectedSession(null);
      setMessages([]);
    } catch (error) {
      console.error("Error closing chat:", error);
      toast({ title: "Error al cerrar chat", variant: "destructive"});
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] gap-6">
      <Card className="shadow-lg shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Panel de Agente de Chat en Vivo
          </CardTitle>
          <CardDescription>
            Gestiona las conversaciones de chat con los visitantes de tu sitio web.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex-grow grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-hidden">
        <Card className="md:col-span-1 lg:col-span-1 flex flex-col h-full">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-lg">Conversaciones</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow overflow-y-auto p-2">
            <ChatList
              sessions={chatSessions}
              selectedSessionId={selectedSession?.id || null}
              onSelectSession={handleSelectSession}
              isLoading={isLoadingSessions}
              currentAgentId={currentUser?.id || null}
            />
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
          {selectedSession && currentUser ? (
            <ChatWindow
              session={selectedSession}
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoadingMessages={isLoadingMessages}
              currentAgent={{id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl}}
              onCloseChat={handleCloseChat}
            />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <MessageSquare size={48} className="mb-4 text-primary" />
              <p className="text-lg font-semibold">Panel de Chat</p>
              <p className="text-sm">Selecciona una conversación de la lista para comenzar.</p>
              <p className="text-xs mt-2">Los nuevos chats entrantes aparecerán en la lista de la izquierda.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
