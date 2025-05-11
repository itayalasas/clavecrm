
"use client";

import type { Ticket, Lead, User, TicketPriority, TicketStatus, Comment } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit3, Trash2, User as UserIconLk, CalendarDays, LinkIcon, ShieldAlert, CheckCircle2, Waypoints, XCircle, Paperclip, MessageSquarePlus, Send, UploadCloud } from "lucide-react";
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { storage, db } from "@/lib/firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, collection } from "firebase/firestore";


interface TicketItemProps {
  ticket: Ticket;
  leads: Lead[];
  users: User[];
  currentUser: User | null;
  onEdit: (ticket: Ticket) => void;
  onDelete: (ticketId: string) => void; 
  onAddComment: (ticketId: string, commentText: string, attachments: {name: string, url: string}[]) => Promise<void>;
}

const UserAvatarNameTooltip = ({ user, label, icon: IconComp }: { user?: User, label: string, icon?: React.ElementType }) => {
    if (!user) return <span className="text-xs text-muted-foreground">{label}: N/A</span>;
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
                {IconComp && <IconComp className="h-4 w-4" />}
                <Avatar className="h-5 w-5">
                  <AvatarImage src={user.avatarUrl || `https://avatar.vercel.sh/${user.email}.png`} alt={user.name} data-ai-hint="user avatar"/>
                  <AvatarFallback>{user.name.substring(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-xs hidden sm:inline">{user.name}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}: {user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
};

export function TicketItem({ ticket, leads, users, currentUser, onEdit, onDelete, onAddComment }: TicketItemProps) {
  const relatedLead = ticket.relatedLeadId ? leads.find(l => l.id === ticket.relatedLeadId) : null;
  const reporter = users.find(u => u.id === ticket.reporterUserId);
  const assignee = ticket.assigneeUserId ? users.find(u => u.id === ticket.assigneeUserId) : null;

  const [newCommentText, setNewCommentText] = useState("");
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [isUploadingCommentAttachment, setIsUploadingCommentAttachment] = useState(false);
  const [commentUploadProgress, setCommentUploadProgress] = useState(0);
  const { toast } = useToast();

  const getPriorityBadge = (priority: TicketPriority) => {
    switch (priority) {
      case 'Alta': return <Badge variant="destructive" className="capitalize flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> {priority}</Badge>;
      case 'Media': return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white capitalize">{priority}</Badge>;
      case 'Baja': return <Badge variant="secondary" className="capitalize">{priority}</Badge>;
      default: return <Badge variant="outline" className="capitalize">{priority}</Badge>;
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'Abierto': return <Badge variant="outline" className="border-blue-500 text-blue-500 flex items-center gap-1"><Waypoints className="h-3 w-3" /> {status}</Badge>;
      case 'En Progreso': return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600 text-white flex items-center gap-1"><Waypoints className="h-3 w-3" /> {status}</Badge>;
      case 'Resuelto': return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {status}</Badge>;
      case 'Cerrado': return <Badge variant="secondary" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> {status}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const handleCommentFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setCommentFile(event.target.files[0]);
    } else {
      setCommentFile(null);
    }
  };

  const handleNewCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() && !commentFile) {
      toast({title: "Comentario Vacío", description: "Escribe un comentario o adjunta un archivo.", variant: "destructive"});
      return;
    }
    if (!currentUser) return;

    let uploadedAttachments: {name: string, url: string}[] = [];

    if (commentFile) {
      setIsUploadingCommentAttachment(true);
      setCommentUploadProgress(0);
      const filePath = `ticket-comments/${ticket.id}/${currentUser.id}/${Date.now()}-${commentFile.name}`;
      const fileStorageRef = storageRef(storage, filePath);
      const uploadTask = uploadBytesResumable(fileStorageRef, commentFile);

      try {
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setCommentUploadProgress(progress);
            },
            (error) => {
              console.error("Error al subir adjunto de comentario:", error);
              toast({ title: "Error al Subir Adjunto", description: error.message, variant: "destructive" });
              setIsUploadingCommentAttachment(false);
              reject(error);
            },
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              uploadedAttachments.push({ name: commentFile.name, url: downloadURL });
              setIsUploadingCommentAttachment(false);
              setCommentFile(null); 
              resolve();
            }
          );
        });
      } catch (error) {
        return; // Stop submission if file upload failed
      }
    }
    
    await onAddComment(ticket.id, newCommentText, uploadedAttachments);
    setNewCommentText("");
    // Note: Email notification for new comment should be handled by a backend function (e.g., Firebase Cloud Function)
    // triggered by writes to the ticket's comments.
  };


  return (
    <Card className={`transition-all duration-200 shadow-sm hover:shadow-md ${ticket.status === 'Cerrado' ? 'bg-muted/50 opacity-80' : 'bg-card'}`}>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value={`ticket-${ticket.id}-details`} className="border-b-0">
          <CardHeader className="p-4 pb-0">
            <div className="flex items-start justify-between gap-2">
                <AccordionTrigger className="p-0 hover:no-underline flex-grow text-left">
                    <CardTitle className={`text-lg ${ticket.status === 'Cerrado' ? 'line-through text-muted-foreground' : ''}`}>{ticket.title}</CardTitle>
                </AccordionTrigger>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => onEdit(ticket)} className="h-8 w-8" aria-label="Editar ticket">
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(ticket.id)} className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Eliminar ticket">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs text-muted-foreground pt-1">
              ID: {ticket.id}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <p className={`text-sm mt-1 mb-3 ${ticket.status === 'Cerrado' ? 'text-muted-foreground/80' : 'text-muted-foreground'}`}>
              {ticket.description.length > 150 ? `${ticket.description.substring(0, 147)}...` : ticket.description}
            </p>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5" title="Estado">
                {getStatusBadge(ticket.status)}
              </div>
              <div className="flex items-center gap-1.5" title="Prioridad">
                {getPriorityBadge(ticket.priority)}
              </div>
              <div className="flex items-center gap-1.5" title="Creado el">
                <CalendarDays className="h-4 w-4" />
                <span>{format(parseISO(ticket.createdAt), "PP p", { locale: es })}</span>
              </div>
              {ticket.updatedAt && isValid(parseISO(ticket.updatedAt)) && (
                <div className="flex items-center gap-1.5" title="Actualizado el">
                  <CalendarDays className="h-4 w-4 text-blue-500" />
                  <span>{format(parseISO(ticket.updatedAt), "PP p", { locale: es })}</span>
                </div>
              )}
              <UserAvatarNameTooltip user={reporter} label="Reportado por" icon={UserIconLk} />
              {assignee ? <UserAvatarNameTooltip user={assignee} label="Asignado a" icon={UserIconLk} /> : 
                <div className="flex items-center gap-1.5" title="Asignado a">
                    <UserIconLk className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Sin asignar</span>
                </div>
              }
              {relatedLead && (
                <div className="flex items-center gap-1.5 col-span-full sm:col-span-1" title="Lead Relacionado">
                  <LinkIcon className="h-4 w-4 text-primary" />
                  <span className="truncate">Lead: {relatedLead.name}</span>
                </div>
              )}
            </div>
          </CardContent>
          <AccordionContent className="px-4 pb-4 space-y-4">
            {ticket.description && ticket.description.length > 150 && (
                <div className="pt-2 border-t">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-1">Descripción Completa:</h4>
                    <p className="text-sm text-card-foreground whitespace-pre-wrap">{ticket.description}</p>
                </div>
            )}
            {ticket.attachments && ticket.attachments.length > 0 && (
              <div className="pt-3 border-t">
                <h4 className="text-sm font-semibold text-primary flex items-center gap-1 mb-2"><Paperclip className="h-4 w-4"/>Adjuntos del Ticket:</h4>
                <ul className="list-none space-y-1 text-sm">
                  {ticket.attachments.map((att, index) => (
                     <li key={index}>
                       <a 
                         href={att.url} 
                         target="_blank" 
                         rel="noopener noreferrer" 
                         className="text-primary hover:underline flex items-center gap-1 break-all"
                         title={`Descargar ${att.name}`}
                        >
                         <Paperclip className="h-3 w-3 shrink-0"/> {att.name}
                       </a>
                     </li> 
                  ))}
                </ul>
              </div>
            )}

            {/* Comments Section */}
            <div className="pt-3 border-t">
              <h4 className="text-sm font-semibold text-primary flex items-center gap-1 mb-2"><MessageSquarePlus className="h-4 w-4"/>Comentarios ({ticket.comments?.length || 0})</h4>
              {ticket.comments && ticket.comments.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {ticket.comments.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(comment => (
                    <div key={comment.id} className="p-3 rounded-md bg-muted/50">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={comment.userAvatarUrl || `https://avatar.vercel.sh/${comment.userName}.png`} alt={comment.userName} data-ai-hint="user avatar"/>
                            <AvatarFallback>{comment.userName.substring(0,1).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium">{comment.userName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{format(parseISO(comment.createdAt), "PP p", { locale: es })}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground">Adjuntos del comentario:</p>
                          <ul className="list-none space-y-0.5 text-xs">
                             {comment.attachments.map((att, idx) => (
                                <li key={idx}>
                                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 break-all" title={att.name}>
                                    <Paperclip className="h-3 w-3 shrink-0"/> {att.name}
                                  </a>
                                </li>
                             ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No hay comentarios aún.</p>
              )}
              {/* Add Comment Form */}
              <form onSubmit={handleNewCommentSubmit} className="mt-4 space-y-2">
                <Textarea 
                  value={newCommentText} 
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Escribe un comentario..."
                  rows={2}
                  disabled={isUploadingCommentAttachment}
                />
                <Input 
                  type="file" 
                  onChange={handleCommentFileChange} 
                  className="text-xs"
                  disabled={isUploadingCommentAttachment}
                  accept="image/*,application/pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.zip,.rar" 
                />
                 {isUploadingCommentAttachment && (
                  <div className="space-y-1">
                    <Progress value={commentUploadProgress} className="w-full h-1.5" />
                    <p className="text-xs text-muted-foreground text-center">Subiendo adjunto... {commentUploadProgress.toFixed(0)}%</p>
                  </div>
                )}
                {commentFile && !isUploadingCommentAttachment && (
                  <p className="text-xs text-muted-foreground">Archivo para comentario: {commentFile.name}</p>
                )}
                <Button type="submit" size="sm" disabled={(!newCommentText.trim() && !commentFile) || isUploadingCommentAttachment}>
                  {isUploadingCommentAttachment ? <><UploadCloud className="mr-2 h-4 w-4 animate-pulse" /> Subiendo...</> : <><Send className="mr-2 h-4 w-4" /> Enviar Comentario</>}
                </Button>
                 <p className="text-xs text-muted-foreground">Las notificaciones por correo para nuevos comentarios requieren configuración de backend (ej. Firebase Cloud Functions).</p>
              </form>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
