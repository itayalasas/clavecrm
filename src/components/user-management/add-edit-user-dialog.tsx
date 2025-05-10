
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
  DialogTrigger,
} from "@/components/ui/dialog";
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

const formSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio."),
  email: z.string().email("Correo electrónico inválido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
  role: z.enum(USER_ROLES, { errorMap: () => ({ message: "Rol inválido."}) }),
});

type UserFormValues = z.infer<typeof formSchema>;

interface AddEditUserDialogProps {
  trigger: React.ReactNode;
  userToEdit?: User | null; // For future edit functionality
  onUserAdded?: (user: User) => void;
}

export function AddEditUserDialog({ trigger, userToEdit, onUserAdded }: AddEditUserDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { signup } = useAuth();
  const { toast } = useToast();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: DEFAULT_USER_ROLE,
    },
  });

  useEffect(() => {
    if (userToEdit) {
      // Pre-fill form for editing (password field would be handled differently for edits)
      form.reset({
        name: userToEdit.name,
        email: userToEdit.email,
        password: "", // Password should not be pre-filled for edit
        role: userToEdit.role,
      });
    } else {
      form.reset({ // Reset to defaults when opening for new user
        name: "",
        email: "",
        password: "",
        role: DEFAULT_USER_ROLE,
      });
    }
  }, [userToEdit, isOpen, form]);

  const onSubmitHandler: SubmitHandler<UserFormValues> = async (data) => {
    if (userToEdit) {
      // Handle update logic (requires different auth context function)
      toast({ title: "Funcionalidad no implementada", description: "La edición de usuarios aún no está disponible.", variant: "destructive" });
      return;
    }

    try {
      const userCredential = await signup(data.email, data.password, data.name, data.role);
      toast({
        title: "Usuario Creado Exitosamente",
        description: `Se ha creado el usuario ${data.name}. Se han enviado correos de verificación y reseteo de contraseña.`,
      });
      if (onUserAdded && userCredential.user) {
        onUserAdded({
            id: userCredential.user.uid,
            name: data.name,
            email: data.email,
            role: data.role,
        });
      }
      setIsOpen(false);
      form.reset();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast({
        title: "Error al Crear Usuario",
        description: error.message || "Ocurrió un error inesperado.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
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
                    <Input type="email" placeholder="Ej. juan.perez@ejemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!userToEdit && ( // Only show password for new user creation
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
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol / Cargo</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Guardando..." : (userToEdit ? "Guardar Cambios" : "Crear Usuario")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
