
"use client";

import type { EmailMessage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"; // Added CardDescription and CardFooter
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Paperclip, ArrowLeft, Reply, ReplyAll, Forward, Trash2, Clock, Send, Inbox } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { es } from 'date-fns/locale';
import { getUserInitials } from "@/lib/utils";

interface EmailDetailViewProps {
  email: EmailMessage;
  onClose: () => void;
  onReply: (email: EmailMessage) => void;
  onReplyAll: (email: EmailMessage) => void;
  onForward: (email: EmailMessage) => void;
  // onDelete: (emailId: string) => void; // Future
}

export function EmailDetailView({ email, onClose, onReply, onReplyAll, onForward }: EmailDetailViewProps) {
  
  const renderRecipients = (recipients: { name?: string, email: string }[] | undefined) => {
    if (!recipients || recipients.length === 0) return <span className="text-muted-foreground italic">ninguno</span>;
    return recipients.map(r => r.name || r.email).join(', ');
  };

  const getStatusIcon = (status: EmailMessage['status']) => {
    switch (status) {
      case 'sent': return <Send className="h-4 w-4 text-green-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-amber-500" />;
      case 'received': return <Inbox className="h-4 w-4 text-blue-500" />;
      case 'draft': return <Archive className="h-4 w-4 text-gray-500" />; // Assuming Archive is imported if draft is used
      default: return null;
    }
  };

  return (
    <Card className="shadow-lg flex flex-col h-full">
      <CardHeader className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <Button variant="outline" size="sm" onClick={onClose} className="flex items-center">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la Lista
          </Button>
          <div className="flex items-center gap-2">
            {getStatusIcon(email.status)}
            <span className="text-sm text-muted-foreground capitalize">{email.status}</span>
          </div>
        </div>
        <CardTitle className="text-xl break-all">{email.subject || "(Sin Asunto)"}</CardTitle>
        <div className="flex items-center gap-3 mt-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={`https://avatar.vercel.sh/${email.from.email}.png`} alt={email.from.name || email.from.email} data-ai-hint="user avatar"/>
            <AvatarFallback>{getUserInitials(email.from.name || email.from.email)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{email.from.name || email.from.email}</p>
            <p className="text-xs text-muted-foreground">
              {isValid(parseISO(email.date)) ? format(parseISO(email.date), "PPpp", { locale: es }) : "Fecha inválida"}
            </p>
          </div>
        </div>
        <CardDescription className="text-xs text-muted-foreground mt-2 space-y-0.5"> {/* Used CardDescription */}
          <p><strong className="text-foreground/80">Para:</strong> {renderRecipients(email.to)}</p>
          {email.cc && email.cc.length > 0 && <p><strong className="text-foreground/80">CC:</strong> {renderRecipients(email.cc)}</p>}
          {email.bcc && email.bcc.length > 0 && <p><strong className="text-foreground/80">CCO:</strong> {renderRecipients(email.bcc)}</p>}
        </CardDescription>
      </CardHeader>

      <ScrollArea className="flex-grow">
        <CardContent className="p-4">
          {email.bodyHtml ? (
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
          ) : (
            <pre className="text-sm whitespace-pre-wrap">{email.bodyText || "Este correo no tiene contenido visible."}</pre>
          )}

          {email.attachments && email.attachments.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-semibold mb-2">Adjuntos ({email.attachments.length})</h4>
              <ul className="space-y-1">
                {email.attachments.map((att, index) => (
                  <li key={index} className="text-sm">
                    <a href={att.downloadUrl || '#'} download={att.filename} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                      <Paperclip className="h-4 w-4" /> {att.filename} ({att.size ? `${Math.round(att.size / 1024)} KB` : 'Tamaño desconocido'})
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </ScrollArea>

      <CardFooter className="p-3 border-t flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onReply(email)}>
            <Reply className="mr-2 h-4 w-4" /> Responder
          </Button>
          <Button variant="outline" size="sm" onClick={() => onReplyAll(email)} disabled={(email.to?.length || 0) + (email.cc?.length || 0) <= 1}>
            <ReplyAll className="mr-2 h-4 w-4" /> Responder a Todos
          </Button>
          <Button variant="outline" size="sm" onClick={() => onForward(email)}>
            <Forward className="mr-2 h-4 w-4" /> Reenviar
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Eliminar (Próximamente)" disabled>
          <Trash2 className="h-5 w-5" />
        </Button>
      </CardFooter>
    </Card>
  );
}
