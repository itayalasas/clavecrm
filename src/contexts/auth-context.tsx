// src/contexts/auth-context.tsx
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'; // Added updateDoc
import { auth, db } from '@/lib/firebase';
import type { User, UserRole } from '@/lib/types';
import { DEFAULT_USER_ROLE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logSystemEvent } from '@/lib/auditLogger'; 

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string, name: string, role?: UserRole) => Promise<FirebaseUser | null>;
  logout: () => Promise<void>;
  getAllUsers: () => Promise<User[]>;
  updateUserInFirestore: (userId: string, data: Partial<Pick<User, 'name' | 'role'>>, adminUser: User) => Promise<void>; // Added updateUserInFirestore
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [adminUserForSignup, setAdminUserForSignup] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = { id: user.uid, ...userDocSnap.data() } as User;
            setCurrentUser(userData);
            if (adminUserForSignup && adminUserForSignup.id === user.uid) {
              setAdminUserForSignup(null); 
            }
          } else {
            // This case is problematic if a user exists in Auth but not Firestore
            // For signup flow, we expect this temp state before admin re-login if signup logic signs out admin.
            // If signup keeps admin logged in, this branch shouldn't be hit for the new user immediately.
             console.warn(`Firestore document for user UID ${user.uid} not found. If this is a new user created by an admin, this might be expected until admin re-authenticates or if user data isn't written yet.`);
             // setCurrentUser(null); // Potentially clear CRM user if no Firestore doc
          }
        } catch (dbError) {
            console.error("Error fetching user document from Firestore:", dbError);
            // Consider logging out if Firestore access fails critically, outside of signup flow.
            // await signOut(auth); 
        }
      } else {
        setCurrentUser(null);
        setAdminUserForSignup(null); 
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [adminUserForSignup]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const tempUserForLog = { id: userCredential.user.uid, name: userCredential.user.displayName || email, email: email, role: 'user' as UserRole }; 
      await logSystemEvent(tempUserForLog, 'login', 'User', userCredential.user.uid, `Usuario ${email} inició sesión.`);
    } catch (error: any) {
      console.error("Error en login:", error);
      let errorMessage = "Ocurrió un error al iniciar sesión.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = "Correo electrónico o contraseña incorrectos.";
      }
      toast({
        title: "Error de Inicio de Sesión",
        description: errorMessage,
        variant: "destructive",
      });
      setLoading(false); 
      throw error;
    }
  };

  const signup = async (email: string, pass: string, name: string, role?: UserRole): Promise<FirebaseUser | null> => {
    const adminPerformingSignup = currentUser; 
    if (!adminPerformingSignup) {
        toast({ title: "Error de Permisos", description: "Solo un administrador autenticado puede crear nuevos usuarios.", variant: "destructive"});
        return null;
    }

    try {
      // Note: Firebase SDK doesn't support creating users without signing them in client-side.
      // This will sign in the new user temporarily. The admin will need to sign back in.
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser = userCredential.user;

      const userDocRef = doc(db, "users", newUser.uid);
      const newUserFirestoreData = {
        uid: newUser.uid,
        email: newUser.email,
        name: name,
        role: role || DEFAULT_USER_ROLE,
        createdAt: serverTimestamp(),
        avatarUrl: `https://avatar.vercel.sh/${newUser.email}.png`
      };
      await setDoc(userDocRef, newUserFirestoreData);

      try {
        await sendEmailVerification(newUser);
         toast({
            title: "Usuario Creado Exitosamente",
            description: `Se ha creado el usuario ${name}. Se ha enviado un correo de verificación.`,
        });
      } catch (emailError) {
        console.warn("Error enviando email de verificación:", emailError);
        toast({
            title: "Usuario Creado (Sin Email de Verificación)",
            description: `Se creó ${name}, pero falló el envío del correo de verificación. Contacta soporte.`,
            variant: "default",
            duration: 7000,
        });
      }
      
      await logSystemEvent(adminPerformingSignup, 'create', 'User', newUser.uid, `Usuario ${name} (${email}) creado con rol ${role || DEFAULT_USER_ROLE}.`);
      
      // Important: Sign out the newly created user to allow admin to continue
      // This must happen *before* attempting to sign the admin back in if that was the flow.
      // For now, we assume the admin will manually log back in if their session was affected.
      if (auth.currentUser?.uid === newUser.uid) {
         await signOut(auth);
         // Trigger a re-fetch or UI update to reflect admin needs to log in again.
         // This will make currentUser null and loading false, AppLayout should redirect to /login.
         toast({
            title: "Administrador Desconectado",
            description: "El nuevo usuario fue creado. Por favor, inicia sesión nuevamente como administrador.",
            duration: 10000,
         });
      }
      
      return newUser;
    } catch (error: any) {
      console.error("Error en signup (admin):", error);
      let errorMessage = "Ocurrió un error al crear el usuario.";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "Este correo electrónico ya está en uso.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "La contraseña es demasiado débil. Debe tener al menos 6 caracteres.";
      }
      toast({
        title: "Error al Crear Usuario",
        description: errorMessage,
        variant: "destructive",
      });
      throw error; 
    }
  };
  
  const updateUserInFirestore = async (userId: string, data: Partial<Pick<User, 'name' | 'role'>>, adminUser: User) => {
    if (!userId) {
        throw new Error("Se requiere ID de usuario para actualizar.");
    }
    const userDocRef = doc(db, "users", userId);
    try {
        await updateDoc(userDocRef, {
            ...data,
            updatedAt: serverTimestamp() // Optional: track updates
        });
        // Log audit event for successful update
        const changes = Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(', ');
        await logSystemEvent(adminUser, 'update', 'User', userId, `Datos de usuario actualizados. Cambios: ${changes}.`);

    } catch (error) {
        console.error("Error actualizando usuario en Firestore:", error);
        throw error; // Re-throw to be caught by the dialog
    }
  };


  const logout = async () => {
    const userLoggingOut = currentUser; 
    try {
      await signOut(auth);
      if (userLoggingOut) {
        await logSystemEvent(userLoggingOut, 'logout', 'User', userLoggingOut.id, `Usuario ${userLoggingOut.name} cerró sesión.`);
      }
    } catch (error: any) {
      console.error("Error en logout:", error);
       toast({
        title: "Error al Cerrar Sesión",
        description: "Ocurrió un error inesperado.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const getAllUsers = async (): Promise<User[]> => {
    try {
      const usersCollectionRef = collection(db, "users");
      const querySnapshot = await getDocs(usersCollectionRef);
      const usersList = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt instanceof Date ? data.createdAt.toISOString() : 
                       (typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().toISOString() : String(data.createdAt || '')),
        } as User;
      });
      return usersList;
    } catch (error) {
      console.error("Error fetching all users:", error);
      toast({
        title: "Error al Cargar Usuarios",
        description: "No se pudieron cargar los datos de los usuarios.",
        variant: "destructive",
      });
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, firebaseUser, loading, login, signup, logout, getAllUsers, updateUserInFirestore }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
