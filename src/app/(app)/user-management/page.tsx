
"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { AddEditUserDialog } from "@/components/user-management/add-edit-user-dialog";
import { UsersTable } from "@/components/user-management/users-table";
import { useToast } from "@/hooks/use-toast";
import { NAV_ITEMS } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null); // For future edit functionality
  
  const { getAllUsers, currentUser } = useAuth();
  const { toast } = useToast();

  const userManagementNavItem = NAV_ITEMS.find(item => item.href === '/user-management');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError(err.message || "Ocurrió un error al cargar los usuarios.");
      toast({
        title: "Error al Cargar Usuarios",
        description: err.message || "No se pudieron cargar los datos de los usuarios.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [getAllUsers, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUserAdded = (newUser: User) => {
    setUsers(prevUsers => [newUser, ...prevUsers]); // Add to the top for immediate visibility
    // or fetchUsers(); // To re-fetch and ensure sorting/consistency from backend
  };

  const handleEditUser = (user: User) => {
    // setEditingUser(user);
    // Open AddEditUserDialog with userToEdit prop
    toast({ title: "Funcionalidad no implementada", description: "La edición de usuarios aún no está disponible." });
  };

  const handleDeleteUser = (userId: string) => {
    // Call delete user function from context (needs implementation with Admin SDK or Cloud Function)
    toast({ title: "Funcionalidad no implementada", description: "La eliminación de usuarios aún no está disponible." });
    // Example: Optimistic update or re-fetch
    // setUsers(prevUsers => prevUsers.filter(u => u.id !== userId)); 
  };
  
  // Basic role check - in a real app, this would be more robust
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'supervisor') {
    return (
        <Card className="m-auto mt-10 max-w-md">
            <CardHeader>
                <CardTitle>Acceso Denegado</CardTitle>
                <CardDescription>No tienes permisos para acceder a esta sección.</CardDescription>
            </CardHeader>
            <CardContent>
                <p>Por favor, contacta a un administrador si crees que esto es un error.</p>
            </CardContent>
        </Card>
    );
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{userManagementNavItem?.label || "Gestión de Usuarios"}</h2>
        <AddEditUserDialog
            trigger={
              <Button>
                <PlusCircle className="mr-2 h-5 w-5" /> Añadir Nuevo Usuario
              </Button>
            }
            userToEdit={editingUser}
            onUserAdded={handleUserAdded}
          />
      </div>
      
      {error && (
        <Card className="bg-destructive/10 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={fetchUsers} variant="outline" className="mt-4">Reintentar</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuarios</CardTitle>
          <CardDescription>Visualiza y gestiona los usuarios del sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable
            users={users}
            isLoading={isLoading && !error} // Show skeleton only if loading and no error displayed
            onEditUser={handleEditUser}
            onDeleteUser={handleDeleteUser}
          />
        </CardContent>
      </Card>
    </div>
  );
}
