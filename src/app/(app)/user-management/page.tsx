'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { collection, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { useCollection } from 'react-firebase-hooks/firestore';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { AddEditUserDialog } from '@/components/user-management/add-edit-user-dialog';
import { UsersTable } from '@/components/user-management/users-table';
import { NAV_ITEMS } from '@/lib/constants';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { User, Role } from '@/lib/types';

/**
 * Genera un Data URI de imagen SVG con las iniciales dadas.
 */
function generateInitialsAvatar(
  firstName: string,
  lastName: string,
  size = 100,
  bgColor = '#4F46E5'
): string {
  const initials =
    (firstName.charAt(0) || '').toUpperCase() +
    (lastName.charAt(0) || '').toUpperCase();
  const fontSize = Math.floor(size * 0.4);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="100%" height="100%" fill="${bgColor}" />
      <text x="50%" y="50%" dy=".35em"
            fill="#ffffff"
            font-family="Arial, Helvetica, sans-serif"
            font-size="${fontSize}"
            text-anchor="middle">
        ${initials}
      </text>
    </svg>
  `.trim();
  const base64 = typeof window === 'undefined'
    ? Buffer.from(svg).toString('base64')
    : window.btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Convierte un Data URI en Blob.
 */
async function dataUriToBlob(dataUri: string): Promise<Blob> {
  const [meta, b64] = dataUri.split(',');
  const mime = meta.match(/:(.*?);/)![1];
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

export default function UserManagementPage() {
  const router = useRouter();
  const { currentUser, loading: loadingAuth, hasPermission } = useAuth();
  const { toast } = useToast();

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);

  // Fetch roles
  const [rolesSnapshot, loadingRoles, rolesError] = useCollection(
    collection(db, 'roles')
  );
  const roles: Role[] = rolesSnapshot
    ? rolesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Role))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // Get nav label
  const navItem = NAV_ITEMS.find(item => item.href === '/user-management');

  // Random color generator for avatar background
  const getRandomColor = useCallback(() => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Assuming authContext.getAllUsers returns User[]
      const snapshot = await getDocs(collection(db, 'users'));
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(fetched);
    } catch (err: any) {
      setError(err.message);
      toast({ title: 'Error al cargar usuarios', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!loadingAuth) {
      if (!currentUser || !hasPermission('ver-usuarios')) {
        router.push('/access-denied');
        return;
      }
      fetchUsers();
    }
  }, [loadingAuth, currentUser, hasPermission, router, fetchUsers]);

  // Save (add or edit) user
  const handleSaveUser = async (
    userData: Partial<User> & { roleId: string }
  ) => {
    try {
      const { name = '', lastName = '', roleId, ...rest } = userData;
      const usersColl = collection(db, 'users');
      let userId = editingUser?.id;

      // New user: generate ID
      if (!userId) {
        userId = doc(usersColl).id;
      }

      const dataToSave: Partial<User> = {
        ...rest,
        name,
        lastName,
        role: roleId,
      };

      // Generate avatar
      const dataUri = generateInitialsAvatar(
        name,
        lastName,
        100,
        getRandomColor()
      );
      const blob = await dataUriToBlob(dataUri);
      const storage = getStorage();
      const avatarRef = ref(storage, `avatars/${userId}.png`);
      await uploadBytes(avatarRef, blob);
      const downloadUrl = await getDownloadURL(avatarRef);
      dataToSave.avatarUrl = downloadUrl;

      // Write Firestore
      if (editingUser) {
        await updateDoc(doc(db, 'users', userId), dataToSave);
        toast({ title: 'Usuario actualizado' });
      } else {
        await setDoc(doc(db, 'users', userId), dataToSave);
        toast({ title: 'Usuario creado' });
      }

      fetchUsers();
      setIsUserDialogOpen(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error guardando usuario', description: err.message, variant: 'destructive' });
    }
  };

  const handleEditUser = (u: User) => {
    setEditingUser(u);
    setIsUserDialogOpen(true);
  };

  const handleDeleteUser = (id: string) => {
    toast({ title: 'Funcionalidad no implementada' });
  };

  if (loadingAuth) {
    return <div>Cargando...</div>;
  }

  if (!hasPermission('ver-usuarios')) {
    return (
      <Card className="m-auto mt-10 max-w-md">
        <CardHeader>
          <CardTitle>Acceso Denegado</CardTitle>
          <CardDescription>Sin permisos para acceder.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Contacta al administrador.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">
          {navItem?.label || 'Gestión de Usuarios'}
        </h2>
        <Button onClick={() => setIsUserDialogOpen(true)}>
          <PlusCircle className="mr-2 h-5 w-5" />Añadir Usuario
        </Button>
      </div>

      {error && (
        <Card className="bg-destructive/10 border-destructive">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button onClick={fetchUsers} variant="outline">
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      <UsersTable
        users={users}
        isLoading={isLoading}
        onEditUser={handleEditUser}
        onDeleteUser={handleDeleteUser}
      />

      <AddEditUserDialog
        isOpen={isUserDialogOpen}
        onOpenChange={open => {
          setIsUserDialogOpen(open);
          if (!open) setEditingUser(null);
        }}
        userToEdit={editingUser}
        onSave={handleSaveUser}
        roles={roles}
        loadingRoles={loadingRoles}
        rolesError={rolesError}
      />
    </div>
  );
}
