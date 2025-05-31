
// src/app/(app)/user-management/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/auth-context";
import { Loader2, Pen, Trash2 } from "lucide-react";
import type { User, Role as UserRoleType } from "@/lib/types";
import { AddEditUserDialog, type UserFormValues } from "@/components/user-management/add-edit-user-dialog";
import { UsersTable } from "@/components/user-management/users-table";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { generateInitialsAvatar, dataUriToBlob, getRandomColor, getUserInitials } from "@/lib/utils";

// Define the schema for adding a new user
const addUserFormSchema = z.object({
    name: z.string().min(1, "El nombre es requerido"),
    email: z.string().email("Correo electrónico no válido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    role: z.string().min(1, "El rol es requerido"), // This is the roleId
});


// Componente de página principal para la gestión de usuarios
export default function UserManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<UserRoleType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);
    const { currentUser: adminUser, signup, updateUserInFirestore } = useAuth();
    const { toast } = useToast();

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const usersCollection = collection(db, "users");
            const usersSnapshot = await getDocs(usersCollection);
            const rolesCollectionRef = collection(db, "roles"); // Renamed for clarity
            const rolesSnapshot = await getDocs(rolesCollectionRef);
            const rolesMap = new Map(rolesSnapshot.docs.map(docSnap => [docSnap.id, docSnap.data().name]));

            const usersList = usersSnapshot.docs.map(docSnap => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    ...data,
                    roleName: rolesMap.get(data.role) || data.role
                } as User;
            });
            setUsers(usersList);
        } catch (error: any) {
            console.error("Error fetching users:", error);
            toast({ title: "Error al cargar usuarios", description: error.message || "No se pudieron cargar los usuarios.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    const fetchRoles = useCallback(async () => {
        try {
            const rolesCollectionRef = collection(db, "roles");
            const rolesSnapshot = await getDocs(rolesCollectionRef);
            const rolesList = rolesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as UserRoleType[];
            setRoles(rolesList);
        } catch (error: any) {
            console.error("Error fetching roles:", error);
            toast({ title: "Error al cargar roles", description: error.message || "No se pudieron cargar los roles.", variant: "destructive" });
        }
    }, [toast]);

    useEffect(() => {
        fetchUsers();
        fetchRoles();
    }, [fetchUsers, fetchRoles]);

    const handleEditUser = useCallback((user: User) => {
        setUserToEdit(user);
        setIsDialogOpen(true);
    }, []);

    const handleAddUser = () => {
        setUserToEdit(null);
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setUserToEdit(null);
    };

    const handleDeleteUser = async (userId: string, userName: string) => {
        if (!adminUser) {
             toast({ title: "Error de autenticación", description: "No se pudo verificar el administrador.", variant: "destructive" });
             return;
        }
         if (window.confirm(`¿Estás seguro de que quieres eliminar a ${userName}? Esta acción no se puede deshacer.`)) {
            try {
                 await deleteDoc(doc(db, "users", userId));
                 toast({ title: "Usuario Eliminado de Firestore", description: `${userName} ha sido eliminado de la base de datos.` });
                 fetchUsers();
            } catch (error: any) {
                console.error("Error deleting user from Firestore:", error);
                toast({ title: "Error al Eliminar Usuario", description: error.message || "No se pudo eliminar el usuario de Firestore.", variant: "destructive" });
            }
         }
    };

    const handleSaveUserWithAvatar = async (userData: UserFormValues) => {
        if (!adminUser) {
            toast({ title: "Error de autenticación", description: "No se pudo verificar el administrador.", variant: "destructive" });
            throw new Error("Usuario administrador no autenticado.");
        }
        setIsLoading(true);
        try {
            if (userToEdit && userToEdit.id) { // Modo Edición
                const editData = userData as z.infer<typeof editUserFormSchema>; // Explicit type assertion
                const roleIdToUpdate = editData.role;
                
                const updatedUserData: Partial<User> = {
                    name: editData.name,
                    role: roleIdToUpdate,
                };
                await updateUserInFirestore(userToEdit.id, updatedUserData, adminUser);
                toast({ title: "Usuario Actualizado", description: `Los datos de ${editData.name} han sido actualizados.` });
            } else { // Modo Añadir
                const addData = userData as z.infer<typeof addUserFormSchema>; // Explicit type assertion

                // Check if email already exists
                const signInMethods = await fetchSignInMethodsForEmail(auth, addData.email);
                if (signInMethods.length > 0) {
                  toast({ title: "Error", description: "El correo electrónico ya está registrado.", variant: "destructive" });
                  setIsLoading(false); // Reset loading state
                  return; // Stop submission
                }
                
                const newFirebaseUser = await signup(addData.email, addData.password, addData.name, addData.role);

                if (newFirebaseUser && newFirebaseUser.uid) {
                    const initials = getUserInitials(addData.name); // Use full name
 // Corrected function name
                    const avatarColor = getRandomColor();
 // Corrected function name
                    const avatarDataUri = generateInitialsAvatar(initials, avatarColor);
 // Corrected function name
                    const avatarBlob = dataUriToBlob(avatarDataUri);
                    const storage = getStorage();
                    const avatarRef = storageRef(storage, `avatars/${newFirebaseUser.uid}.png`);

                    await uploadBytes(avatarRef, avatarBlob);
                    const avatarUrl = await getDownloadURL(avatarRef);

                    const userDocRef = doc(db, "users", newFirebaseUser.uid);
                    await updateDoc(userDocRef, { avatarUrl: avatarUrl });

                    toast({ title: "Usuario Creado", description: `El usuario ${addData.name} ha sido creado con avatar.` });
                } else {
                   // Handle case where signup might not return a user or uid, though signup should throw if it fails
                   throw new Error("La creación del usuario en Firebase Authentication falló o no devolvió un UID.");
 // Remove this throw
 toast({ title: "Error de Creación de Usuario", description: "La creación del usuario falló o no se recibió un ID de usuario.", variant: "destructive" }); // Add this toast
 // You might want to add a return here if you don't want fetchUsers and handleCloseDialog to run
 return;
 }
            }
            fetchUsers();
            handleCloseDialog();
        } catch (error: any) {
            console.error("Error guardando usuario:", error);
            toast({ title: "Error al Guardar Usuario", description: error.message || "Ocurrió un error.", variant: "destructive" });
            // Do not re-throw here if you want the dialog to potentially stay open or manage loading state differently
        } finally {
            setIsLoading(false);
        }
    }; // Ensure this function is correctly closed

    return (
        <div className="container mx-auto py-10">
            <h1 className="text-2xl font-bold mb-6">Gestión de Usuarios</h1>

            <Button onClick={handleAddUser} className="mb-4">Añadir Nuevo Usuario</Button>

            {isLoading && users.length === 0 ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2">Cargando usuarios...</p>
                </div>
            ) : (
                <UsersTable
                    users={users}
                    isLoading={isLoading}
                    onEditUser={handleEditUser}
                    onDeleteUser={(userId) => {
                        const user = users.find(u => u.id === userId);
                        if (user) handleDeleteUser(userId, user.name);
                    }}
                />
            )}

            <AddEditUserDialog
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen} // This will call handleCloseDialog implicitly on close
                userToEdit={userToEdit}
                roles={roles}
                onSave={handleSaveUserWithAvatar}
            />
        </div>
    );
}
