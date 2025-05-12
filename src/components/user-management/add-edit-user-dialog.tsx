"use client";

import { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { User, UserRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"; // DialogTrigger removed as it's handled by parent
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { USER_ROLES, DEFAULT_USER_ROLE } from "@/lib/constants";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const addUserFormSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio."),
  email: z.string().email("Correo electrónico inválido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  role: z.enum(USER_ROLES as [string, ...string[]], { errorMap: () => ({ message: "Rol inválido."}) }),
});

const editUserFormSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio."),
  email: z.string().email("Correo electrónico inválido."), // Will be read-only
  role: z.enum(USER_ROLES as [string, ...string[]], { errorMap: () => ({ message: "Rol inválido."}) }),
});

type UserFormValues = z.infer<typeof addUserFormSchema> | z.infer<typeof editUserFormSchema>;

interface AddEditUserDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: User | null; 
  onSaveSuccess: (user: User) => void; // Generalized callback
}

export function AddEditUserDialog({ isOpen, onOpenChange, userToEdit, onSaveSuccess }: AddEditUserDialogProps) {
  const { signup, updateUserInFirestore, currentUser: adminUser } = useAuth();
  const { toast } = useToast();
  
  const formSchema = userToEdit ? editUserFormSchema : addUserFormSchema;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: userToEdit 
      ? { name: userToEdit.name, email: userToEdit.email, role: userToEdit.role }
      : { name: "", email: "", password: "", role: DEFAULT_USER_ROLE },
  });

  useEffect(() => {
    if (isOpen) {
      if (userToEdit) {
        form.reset({
          name: userToEdit.name,
          email: userToEdit.email,
          role: userToEdit.role,
        });
      } else {
        form.reset({ 
          name: "",
          email: "",
          password: "",
          role: DEFAULT_USER_ROLE,
        });
      }
    }
  }, [userToEdit, isOpen, form]);

  const onSubmitHandler: SubmitHandler<UserFormValues> = async (data) => {
    if (!adminUser) {
      toast({ title: "Error de autenticación", description: "No se pudo verificar el administrador.", variant: "destructive"});
      return;
    }

    if (userToEdit) { // Editing existing user
      try {
        const updatedUserData: Partial<User> = {
            name: data.name,
            role: (data as z.infer<typeof editUserFormSchema>).role, // Type assertion
        };
        await updateUserInFirestore(userToEdit.id, updatedUserData, adminUser);
        onSaveSuccess({ ...userToEdit, ...updatedUserData });
        toast({ title: "Usuario Actualizado", description: `Los datos de ${data.name} han sido actualizados.` });
        onOpenChange(false);
      } catch (error: any) {
        console.error("Error updating user:", error);
        toast({ title: "Error al Actualizar", description: error.message || "No se pudo actualizar el usuario.", variant: "destructive"});
      }
    } else { // Adding new user
      const addData = data as z.infer<typeof addUserFormSchema>; // Type assertion
      try {
        const firebaseUser = await signup(addData.email, addData.password, addData.name, addData.role);
        if (firebaseUser?.uid) {
          onSaveSuccess({
              id: firebaseUser.uid,
              name: addData.name,
              email: addData.email,
              role: addData.role,
          });
        }
        onOpenChange(false);
      } catch (error: any) {
        console.error("Error creating user (dialog):", error);
        // Toast is handled in signup
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{userToEdit ? "Editar Usuario" : "Añadir Nuevo Usuario"}</DialogTitle>
          <DialogDescription>
            {userToEdit ? "Actualiza los detalles de este usuario." : "Completa la información para el nuevo usuario."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Juan Pérez" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo Electrónico</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Ej. juan.perez@ejemplo.com" {...field} readOnly={!!userToEdit} />
                  </FormControl>
                   {!!userToEdit && <FormDescription className="text-xs">El correo electrónico no se puede cambiar después de la creación.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            {!userToEdit && ( 
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Mínimo 6 caracteres" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {userToEdit && (
                <div className="text-sm p-3 bg-muted/50 rounded-md">
                    <p className="font-medium">Gestión de Contraseña:</p>
                    <p className="text-xs text-muted-foreground">
                        Los cambios de contraseña para usuarios existentes se realizan a través del proceso de "Olvidé mi contraseña" por el propio usuario, o por un administrador mediante herramientas específicas (no disponible en este formulario).
                    </p>
                </div>
            )}
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol / Cargo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {USER_ROLES.map((role) => (
                        <SelectItem key={role} value={role} className="capitalize">
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.formState.isSubmitting ? "Guardando..." : (userToEdit ? "Guardar Cambios" : "Crear Usuario")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
