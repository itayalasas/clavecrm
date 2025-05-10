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
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUser({ id: user.uid, ...userDocSnap.data() } as User);
        } else {
          console.warn("User document not found in Firestore for UID:", user.uid, "Creating a default one or logging out.");
          // This situation should ideally be handled based on specific app logic.
          // For now, if a user is auth'd but has no Firestore doc, we can log them out or create a default.
          // Given the flow where admin creates users, this might be an edge case.
          // Let's assume if they are authenticated, we try to give them a basic profile.
           setCurrentUser({
             id: user.uid,
             email: user.email || "",
             name: user.displayName || "Usuario",
             role: DEFAULT_USER_ROLE, // Fallback role
           });
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
      setLoading(false); // Ensure loading is false on error
      throw error;
    }
    // setLoading(false) is handled by onAuthStateChanged
  };

  // Signup function used by an admin to create a new user.
  // This function does NOT log in the newly created user.
  const signup = async (email: string, pass: string, name: string, role?: UserRole): Promise<FirebaseUser> => {
    // Note: setLoading(true/false) is not managed here as this is an admin action,
    // and the admin's loading state should not be affected.
    // The component calling signup should manage its own UI loading state.
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser = userCredential.user;

      // Save user details to Firestore
      const userDocRef = doc(db, "users", newUser.uid);
      await setDoc(userDocRef, {
        uid: newUser.uid,
        email: newUser.email,
        name: name,
        role: role || DEFAULT_USER_ROLE,
        createdAt: new Date().toISOString(),
        avatarUrl: `https://avatar.vercel.sh/${newUser.email}.png` // Default avatar
      });

      // Send verification email to the new user
      await sendEmailVerification(newUser);

      // Send password reset email to the new user so they can set their password
      await sendPasswordResetEmail(auth, email);
      
      // Do not call setCurrentUser or change global loading state here.
      // The admin performing this action remains logged in.
      return newUser; // Return the FirebaseUser object
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
      setCurrentUser(null);
      setFirebaseUser(null);
    } catch (error: any) {
      console.error("Error en logout:", error);
       toast({
        title: "Error al Cerrar Sesión",
        description: "Ocurrió un error inesperado.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoading(false); // onAuthStateChanged might also set this, but ensure it's false.
    }
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
