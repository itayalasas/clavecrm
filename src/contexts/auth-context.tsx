
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
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User, UserRole } from '@/lib/types';
import { DEFAULT_USER_ROLE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logSystemEvent } from '@/lib/auditLogger'; // Import the audit logger

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string, name: string, role?: UserRole) => Promise<FirebaseUser | null>;
  logout: () => Promise<void>;
  getAllUsers: () => Promise<User[]>;
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
            // Store admin user if signup process was initiated
            if (adminUserForSignup && adminUserForSignup.id === user.uid) {
              // This means admin logged back in after new user creation
              setAdminUserForSignup(null); // Clear the stored admin
            } else if (!adminUserForSignup) {
                // This is a normal login, not part of signup flow
            }

          } else {
            console.warn(`Firestore document for user UID ${user.uid} not found during auth state change. This might happen if a new user was just created and the admin hasn't signed back in yet.`);
            // Don't auto-logout here as it might interfere with the signup flow's admin re-login
          }
        } catch (dbError) {
            console.error("Error fetching user document from Firestore:", dbError);
            // Potentially logout if this is a critical error not related to signup flow
            // await signOut(auth);
        }
      } else {
        setCurrentUser(null);
        setAdminUserForSignup(null); // Clear admin user if logged out
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [adminUserForSignup]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      // User data will be set by onAuthStateChanged
      // Log login event after user data is potentially available from onAuthStateChanged
      // To get the full User object for logging, we might need to fetch it again here or rely on onAuthStateChanged to set it
      // For simplicity, we'll log with basic info first, onAuthStateChanged will provide the full User object later.
      const tempUserForLog = { id: userCredential.user.uid, name: userCredential.user.displayName || email, email: email, role: 'user' as UserRole }; // Temporary
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
    // setLoading(false) is handled by onAuthStateChanged
  };

  const signup = async (email: string, pass: string, name: string, role?: UserRole): Promise<FirebaseUser | null> => {
    if (!auth.currentUser) {
        toast({ title: "Error de Administrador", description: "El administrador debe estar autenticado para crear nuevos usuarios.", variant: "destructive"});
        return null;
    }
    const adminPerformingSignup = currentUser; // Capture admin user *before* potential auth state change
    setAdminUserForSignup(adminPerformingSignup); // Store admin to re-login

    try {
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

      await sendEmailVerification(newUser);
      // Password reset email is typically sent if user forgets, not usually on signup.
      // If you want to force a password change, you'd guide them to reset after first login.
      // await sendPasswordResetEmail(auth, email); 

      toast({
        title: "Usuario Creado Exitosamente",
        description: `Se ha creado el usuario ${name}. Se ha enviado un correo de verificación.`,
      });
      
      if (adminPerformingSignup) {
        await logSystemEvent(adminPerformingSignup, 'create', 'User', newUser.uid, `Usuario ${name} (${email}) creado con rol ${role || DEFAULT_USER_ROLE}.`);
      }

      // Sign out the newly created user (who was automatically signed in)
      await signOut(auth); 
      
      // The admin is now signed out. They need to log back in.
      // onAuthStateChanged will handle setting firebaseUser to null and then currentUser to null.
      // The UI should redirect to login or handle this state appropriately.
      toast({
        title: "Acción Requerida",
        description: "El nuevo usuario ha sido creado. El administrador debe iniciar sesión nuevamente.",
        duration: 7000,
      });
      
      return newUser;
    } catch (error: any) {
      setAdminUserForSignup(null); // Clear if signup failed
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
    const userLoggingOut = currentUser; // Capture user before logout
    // setLoading(true); // onAuthStateChanged will set loading to false
    try {
      await signOut(auth);
      if (userLoggingOut) {
        await logSystemEvent(userLoggingOut, 'logout', 'User', userLoggingOut.id, `Usuario ${userLoggingOut.name} cerró sesión.`);
      }
      // setCurrentUser(null) and setFirebaseUser(null) will be handled by onAuthStateChanged
    } catch (error: any) {
      console.error("Error en logout:", error);
       toast({
        title: "Error al Cerrar Sesión",
        description: "Ocurrió un error inesperado.",
        variant: "destructive",
      });
      // setLoading(false); 
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
            // Ensure createdAt is a string if it's a Timestamp
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
