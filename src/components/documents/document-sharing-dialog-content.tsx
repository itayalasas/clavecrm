"use client";

import React, { useState, useEffect } from "react";
import type { DocumentFile, DocumentUserPermission, DocumentPermissionLevel, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Copy, Globe, EyeOff, PlusCircle, Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface DocumentSharingDialogContentProps {
  documentFile: DocumentFile;
  allUsers: User[];
  currentUser: User;
  onSaveSharing: (documentId: string, newPermissions: { users: DocumentUserPermission[] }) => Promise<void>;
  onTogglePublic: (documentId: string, currentIsPublic: boolean) => Promise<void>;
  onClose: () => void;
}

const NO_USER_SELECTED = "__NONE__";

export function DocumentSharingDialogContent({
  documentFile,
  allUsers,
  currentUser,
  onSaveSharing,
  onTogglePublic,
  onClose,
}: DocumentSharingDialogContentProps) {
  const { toast } = useToast();
  const [isPublic, setIsPublic] = useState(!!documentFile.isPublic);
  const [localSharedUsers, setLocalSharedUsers] = useState<DocumentUserPermission[]>(
    documentFile.permissions?.users?.slice() || [] // Create a copy
  );
  const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState<string>(NO_USER_SELECTED);
  const [selectedPermissionLevel, setSelectedPermissionLevel] = useState<DocumentPermissionLevel>("view");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsPublic(!!documentFile.isPublic);
    setLocalSharedUsers(documentFile.permissions?.users?.slice() || []);
  }, [documentFile]);

  const handleCopyToClipboard = () => {
    if (isPublic && documentFile.fileURL) {
      navigator.clipboard.writeText(documentFile.fileURL)
        .then(() => toast({ title: "Enlace Copiado", description: "El enlace público ha sido copiado." }))
        .catch(() => toast({ title: "Error al Copiar", variant: "destructive" }));
    }
  };

  const handleTogglePublicSwitch = async (checked: boolean) => {
    setIsSaving(true);
    await onTogglePublic(documentFile.id, isPublic);
    setIsPublic(checked); // Update local state after successful toggle
    setIsSaving(false);
  };

  const handleAddUserPermission = () => {
    if (selectedUserIdToAdd === NO_USER_SELECTED) {
      toast({ title: "Selecciona un usuario", variant: "destructive" });
      return;
    }
    if (localSharedUsers.some(u => u.userId === selectedUserIdToAdd)) {
      toast({ title: "Usuario ya añadido", description: "Este usuario ya tiene permisos para este documento.", variant: "default" });
      return;
    }
    const user = allUsers.find(u => u.id === selectedUserIdToAdd);
    if (user) {
      setLocalSharedUsers(prev => [
        ...prev,
        { userId: user.id, userName: user.name, email: user.email, level: selectedPermissionLevel }
      ]);
      setSelectedUserIdToAdd(NO_USER_SELECTED); // Reset selection
    }
  };

  const handleRemoveUserPermission = (userIdToRemove: string) => {
    setLocalSharedUsers(prev => prev.filter(u => u.userId !== userIdToRemove));
  };

  const handleChangeUserPermissionLevel = (userIdToChange: string, newLevel: DocumentPermissionLevel) => {
    setLocalSharedUsers(prev =>
      prev.map(u => (u.userId === userIdToChange ? { ...u, level: newLevel } : u))
    );
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    await onSaveSharing(documentFile.id, { users: localSharedUsers });
    setIsSaving(false);
    onClose(); // Close dialog after saving
  };
  
  const availableUsersToAdd = allUsers.filter(u => u.id !== currentUser.id && !localSharedUsers.some(sharedUser => sharedUser.userId === u.id));

  const getUserInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length > 1 && parts[0] && parts[1]) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };


  return (
    <div className="space-y-6">
      {/* Public Sharing Section */}
      <div>
        <h3 className="text-md font-semibold mb-2">Acceso Público</h3>
        <div className="flex items-center justify-between p-3 border rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="public-access-switch" className="text-sm font-medium">
              {isPublic ? "Documento Público" : "Documento Privado"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isPublic ? "Cualquiera con el enlace puede ver este documento." : "Solo usuarios compartidos pueden acceder."}
            </p>
          </div>
          <Switch
            id="public-access-switch"
            checked={isPublic}
            onCheckedChange={handleTogglePublicSwitch}
            disabled={isSaving}
          />
        </div>
        {isPublic && documentFile.fileURL && (
          <div className="mt-3 space-y-1">
            <Label htmlFor={`share-link-${documentFile.id}`} className="text-xs">Enlace Público:</Label>
            <div className="flex items-center space-x-2">
              <Input id={`share-link-${documentFile.id}`} value={documentFile.fileURL} readOnly className="text-xs h-8" />
              <Button type="button" size="sm" onClick={handleCopyToClipboard} variant="outline" className="h-8">
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* User-Specific Sharing Section */}
      <div>
        <h3 className="text-md font-semibold mb-2">Compartir con Usuarios Específicos</h3>
        <div className="p-3 border rounded-md space-y-4">
          {/* Add User Form */}
          <div className="flex items-end gap-2">
            <div className="flex-grow">
              <Label htmlFor="select-user-to-add" className="text-xs">Usuario</Label>
              <Select
                value={selectedUserIdToAdd}
                onValueChange={setSelectedUserIdToAdd}
                disabled={availableUsersToAdd.length === 0 || isSaving}
              >
                <SelectTrigger id="select-user-to-add" className="h-9">
                  <SelectValue placeholder={availableUsersToAdd.length === 0 ? "No hay más usuarios" : "Selecciona un usuario"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_USER_SELECTED} disabled>Selecciona un usuario</SelectItem>
                  {availableUsersToAdd.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[120px]">
              <Label htmlFor="select-permission-level" className="text-xs">Permiso</Label>
              <Select
                value={selectedPermissionLevel}
                onValueChange={(val) => setSelectedPermissionLevel(val as DocumentPermissionLevel)}
                disabled={isSaving}
              >
                <SelectTrigger id="select-permission-level" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Ver</SelectItem>
                  <SelectItem value="edit">Editar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
                type="button" 
                size="sm" 
                onClick={handleAddUserPermission} 
                disabled={selectedUserIdToAdd === NO_USER_SELECTED || isSaving}
                className="h-9"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>

          {/* List of Shared Users */}
          {localSharedUsers.length > 0 && (
            <ScrollArea className="h-[150px] mt-3">
              <div className="space-y-2 pr-3">
                {localSharedUsers.map(sharedUser => (
                  <div key={sharedUser.userId} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={`https://avatar.vercel.sh/${sharedUser.email}.png`} alt={sharedUser.userName} data-ai-hint="user avatar" />
                        <AvatarFallback>{getUserInitials(sharedUser.userName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate max-w-[150px]" title={sharedUser.userName}>{sharedUser.userName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        value={sharedUser.level}
                        onValueChange={(val) => handleChangeUserPermissionLevel(sharedUser.userId, val as DocumentPermissionLevel)}
                        disabled={isSaving}
                      >
                        <SelectTrigger className="h-7 text-xs w-[90px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">Ver</SelectItem>
                          <SelectItem value="edit">Editar</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveUserPermission(sharedUser.userId)}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={isSaving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
           {localSharedUsers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Aún no has compartido este documento con usuarios específicos.</p>
           )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          Cancelar
        </Button>
        <Button onClick={handleSaveChanges} disabled={isSaving || JSON.stringify(localSharedUsers) === JSON.stringify(documentFile.permissions?.users || [])}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>}
          Guardar Cambios de Compartir
        </Button>
      </div>
    </div>
  );
}