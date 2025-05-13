"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatList } from "@/components/live-chat/agent-panel/chat-list";
import { ChatWindow } from "@/components/live-chat/agent-panel/chat-window";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LayoutGrid, MessageSquare, Search, Filter, History } from "lucide-react";
import type { ChatSession, ChatMessage } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, Timestamp, getDocs } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AgentPanelPage() {
  const [liveSessions, setLiveSessions] = useState<ChatSession[]>([]);
  const [historySessions, setHistorySessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingLiveSessions, setIsLoadingLiveSessions] = useState(true);
  const [isLoadingHistorySessions, setIsLoadingHistorySessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const [historySearchTerm, setHistorySearchTerm] = useState("");

  // Fetch live sessions
  useEffect(() => {
    if (!currentUser || activeTab !== "live") {
      if (activeTab !== "live") setIsLoadingLiveSessions(false); // Stop loading if tab switched
      return;
    }
    setIsLoadingLiveSessions(true);
    const q = query(
      collection(db, "chatSessions"),
      where("status", "in", ["pending", "active"]),
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
      setLiveSessions(sessions);
      setIsLoadingLiveSessions(false);
    }, (error) => {
      console.error("Error fetching live chat sessions: ", error);
      toast({ title: "Error al cargar chats en vivo", description: "No se pudieron obtener las sesiones de chat.", variant: "destructive" });
      setIsLoadingLiveSessions(false);
    });
    return () => unsubscribe();
  }, [currentUser, toast, activeTab]);

  // Fetch history sessions
  const fetchHistorySessions = useCallback(async () => {
    if (!currentUser || activeTab !== "history") return;
    setIsLoadingHistorySessions(true);
    try {
      const q = query(
        collection(db, "chatSessions"),
        where("status", "==", "closed"),
        orderBy("lastMessageAt", "desc")
      );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
          lastMessageAt: (data.lastMessageAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        } as ChatSession
      });
      setHistorySessions(sessions);
    } catch (error) {
      console.error("Error fetching chat history: ", error);
      toast({ title: "Error al cargar historial", description: "No se pudo obtener el historial de chats.", variant: "destructive" });
    } finally {
      setIsLoadingHistorySessions(false);
    }
  }, [currentUser, toast, activeTab]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistorySessions();
    } else {
      setHistorySessions([]); // Clear history if not on history tab
    }
  }, [activeTab, fetchHistorySessions]);


  // Fetch messages for selected session
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
    if (session.status === 'pending' && currentUser && currentUser.role !== 'user' && activeTab === 'live') { 
      try {
        await updateDoc(doc(db, "chatSessions", session.id), {
          agentId: currentUser.id,
          status: "active",
          lastMessageAt: serverTimestamp()
        });
        toast({ title: "Chat Asignado", description: `Te has asignado al chat con ${session.visitorName || session.visitorId}` });
      } catch (error) {
        console.error("Error assigning chat:", error);
        toast({ title: "Error al asignar chat", variant: "destructive" });
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!selectedSession || !currentUser || !text.trim() || activeTab === 'history') return;
    try {
      await addDoc(collection(db, `chatSessions/${selectedSession.id}/messages`), {
        sessionId: selectedSession.id,
        senderId: currentUser.id,
        senderName: currentUser.name, 
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
    if (!selectedSession || activeTab === 'history') return;
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

  const filteredHistorySessions = historySessions.filter(session => 
    (session.visitorName && session.visitorName.toLowerCase().includes(historySearchTerm.toLowerCase())) ||
    session.visitorId.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
    (session.initialMessage && session.initialMessage.toLowerCase().includes(historySearchTerm.toLowerCase()))
  );

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

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as "live" | "history"); setSelectedSession(null); setMessages([]);}} className="flex-grow flex flex-col">
        <TabsList className="grid w-full grid-cols-2 shrink-0">
          <TabsTrigger value="live">
            <MessageSquare className="mr-2 h-4 w-4" /> Chats en Vivo
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" /> Historial de Chats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="flex-grow mt-0">
          <div className="flex-grow grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-hidden h-full pt-4">
            <Card className="md:col-span-1 lg:col-span-1 flex flex-col h-full">
              <CardHeader className="p-3 pb-1 shrink-0">
                <CardTitle className="text-base">Conversaciones Activas/Pendientes</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto p-2">
                <ChatList
                  sessions={liveSessions}
                  selectedSessionId={selectedSession?.id || null}
                  onSelectSession={handleSelectSession}
                  isLoading={isLoadingLiveSessions}
                  currentAgentId={currentUser?.id || null}
                />
              </CardContent>
            </Card>
            <Card className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
              {selectedSession && activeTab === 'live' && currentUser ? (
                <ChatWindow
                  session={selectedSession}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isLoadingMessages={isLoadingMessages}
                  currentAgent={{id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl}}
                  onCloseChat={handleCloseChat}
                  isReadOnly={false}
                />
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                  <MessageSquare size={48} className="mb-4 text-primary" />
                  <p className="text-lg font-semibold">Panel de Chat en Vivo</p>
                  <p className="text-sm">Selecciona una conversación activa o pendiente de la lista.</p>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="history" className="flex-grow mt-0">
          <div className="flex-grow grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-hidden h-full pt-4">
            <Card className="md:col-span-1 lg:col-span-1 flex flex-col h-full">
              <CardHeader className="p-3 pb-1 shrink-0">
                <CardTitle className="text-base">Historial de Conversaciones</CardTitle>
                  <div className="flex gap-2 mt-2">
                    <div className="relative flex-grow">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input 
                            type="search" 
                            placeholder="Buscar en historial..." 
                            className="pl-8 w-full h-8 text-xs"
                            value={historySearchTerm}
                            onChange={(e) => setHistorySearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                        <Filter className="mr-1.5 h-3.5 w-3.5" /> Filtrar
                    </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto p-2">
                <ChatList
                  sessions={filteredHistorySessions}
                  selectedSessionId={selectedSession?.id || null}
                  onSelectSession={handleSelectSession}
                  isLoading={isLoadingHistorySessions}
                  currentAgentId={currentUser?.id || null}
                  isHistoryList={true}
                />
              </CardContent>
            </Card>
            <Card className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
              {selectedSession && activeTab === 'history' && currentUser ? (
                <ChatWindow
                  session={selectedSession}
                  messages={messages}
                  onSendMessage={() => {}} // No sending in history
                  isLoadingMessages={isLoadingMessages}
                  currentAgent={{id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl}}
                  onCloseChat={() => setSelectedSession(null)} // Special handler for history back button
                  isReadOnly={true}
                />
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                  <History size={48} className="mb-4 text-primary" />
                  <p className="text-lg font-semibold">Historial de Chats</p>
                  <p className="text-sm">Selecciona una conversación cerrada de la lista para ver la transcripción.</p>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
