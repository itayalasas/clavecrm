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
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User, UserRole } from '@/lib/types';
import { DEFAULT_USER_ROLE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string, name: string, role?: UserRole) => Promise<FirebaseUser>;
  logout: () => Promise<void>;
  getAllUsers: () => Promise<User[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setCurrentUser({ id: user.uid, ...userDocSnap.data() } as User);
          } else {
            // User authenticated with Firebase Auth, but no corresponding Firestore document.
            // This could happen if Firestore document creation failed or was deleted.
            // For security and consistency, log out such users.
            console.warn(`Firestore document for user UID ${user.uid} not found. Logging out user.`);
            await signOut(auth); // This will trigger onAuthStateChanged again with user = null
            // setCurrentUser(null) will be handled by the subsequent onAuthStateChanged call.
          }
        } catch (dbError) {
            console.error("Error fetching user document from Firestore:", dbError);
            // Potentially log out user if DB is critical and unreachable
            // This can lead to a loop if signOut also fails or db remains unreachable.
            // For now, we attempt signOut. Consider more robust error handling if this becomes an issue.
            await signOut(auth);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      // onAuthStateChanged will handle setting currentUser
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

  const signup = async (email: string, pass: string, name: string, role?: UserRole): Promise<FirebaseUser> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      // At this point, `userCredential.user` (the new user) is the `auth.currentUser`.
      const newUser = userCredential.user;

      // Save new user's details to Firestore
      const userDocRef = doc(db, "users", newUser.uid);
      await setDoc(userDocRef, {
        uid: newUser.uid,
        email: newUser.email,
        name: name,
        role: role || DEFAULT_USER_ROLE,
        createdAt: new Date().toISOString(),
        avatarUrl: `https://avatar.vercel.sh/${newUser.email}.png` 
      });

      // Send verification and password reset emails to the new user
      await sendEmailVerification(newUser);
      await sendPasswordResetEmail(auth, email);

      // Sign out the newly created user.
      // This ensures the new user is not the active session.
      // Consequently, auth.currentUser will become null.
      // The onAuthStateChanged listener will update the context, effectively logging out the admin too.
      // The admin will need to log in again to perform further actions.
      if (auth.currentUser && auth.currentUser.uid === newUser.uid) {
        await signOut(auth);
      }
      
      toast({
        title: "Usuario Creado Exitosamente",
        description: `Se ha creado el usuario ${name}. El administrador deberá iniciar sesión de nuevo para continuar.`,
      });

      return newUser; // Return the FirebaseUser object of the *created* user.
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

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will set currentUser to null and firebaseUser to null
    } catch (error: any) {
      console.error("Error en logout:", error);
       toast({
        title: "Error al Cerrar Sesión",
        description: "Ocurrió un error inesperado.",
        variant: "destructive",
      });
      setLoading(false); // Ensure loading is set to false on error
      throw error;
    }
    // setLoading(false) will be called by onAuthStateChanged
  };

  const getAllUsers = async (): Promise<User[]> => {
    try {
      const usersCollectionRef = collection(db, "users");
      const querySnapshot = await getDocs(usersCollectionRef);
      const usersList = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as User));
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
    <AuthContext.Provider value={{ currentUser, firebaseUser, loading, login, signup, logout, getAllUsers }}>
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
