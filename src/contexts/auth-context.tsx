
// src/contexts/auth-context.tsx
'use client';

import * as React from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
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
  updateUserInFirestore: (userId: string, data: Partial<Pick<User, 'name' | 'role'>>, adminUser: User) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = React.useState<FirebaseUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();
  const [adminUserForSignup, setAdminUserForSignup] = React.useState<User | null>(null);

  React.useEffect(() => {
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
             console.warn(`Firestore document for user UID ${user.uid} not found.`);
          }
        } catch (dbError) {
            console.error("Error fetching user document from Firestore:", dbError);
        }
      } else {
        setCurrentUser(null);
        setAdminUserForSignup(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [adminUserForSignup]); // adminUserForSignup is a dependency now

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      // Fetch Firestore data for the logged-in user
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = { id: userCredential.user.uid, ...userDocSnap.data() } as User;
        await logSystemEvent(userData, 'login', 'User', userCredential.user.uid, `Usuario ${email} inició sesión.`);
      } else {
        // Fallback if Firestore doc doesn't exist, which shouldn't happen for login
        const tempUserForLog = { id: userCredential.user.uid, name: userCredential.user.displayName || email, email: email, role: 'user' as UserRole, avatarUrl: null };
        await logSystemEvent(tempUserForLog, 'login', 'User', userCredential.user.uid, `Usuario ${email} inició sesión (documento Firestore no encontrado).`);
      }
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
    // setLoading(false) should be here or in a finally block if login is successful and not throwing
  };

  const signup = async (email: string, pass: string, name: string, role?: UserRole): Promise<FirebaseUser | null> => {
    const adminPerformingSignup = currentUser; // Current admin trying to sign up a new user
    
    // Temporarily store the admin's auth state. THIS IS THE CRITICAL PART.
    const previousAuthUser = auth.currentUser;

    if (!adminPerformingSignup) {
        toast({ title: "Error de Permisos", description: "Solo un administrador autenticado puede crear nuevos usuarios.", variant: "destructive"});
        return null;
    }

    setLoading(true); // Should be part of the signup process
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
      
      // After new user is created, Firebase auth state might change to the new user.
      // We need to restore the admin's session.
      // This is tricky because direct re-login without password isn't simple.
      // The onAuthStateChanged listener should ideally handle restoring the admin's state if Firebase still has it.
      // However, explicitly trying to sign out the new user and relying on onAuthStateChanged to pick up the admin is more robust.
      
      if (auth.currentUser && auth.currentUser.uid === newUser.uid) {
        await signOut(auth); // Sign out the newly created user
      }

      // After signing out the new user, onAuthStateChanged should detect the admin's previous session (if it was still valid)
      // or prompt the admin to log in again if their session was truly lost.
      // We rely on the onAuthStateChanged listener to update currentUser and firebaseUser correctly.
      // No need to call login() for admin here, as that requires password.
      
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
      // If signup failed, ensure admin's session is restored if it changed.
      if (previousAuthUser && auth.currentUser?.uid !== previousAuthUser.uid) {
        // This path is complex and ideally Firebase handles session restoration.
        // For now, we assume onAuthStateChanged will restore or the admin needs to re-login.
        console.warn("Signup failed, admin session might need manual restoration if it changed.");
      }
      throw error; // Rethrow to be caught by the calling component
    } finally {
        setLoading(false); // Ensure loading is set to false
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
            updatedAt: serverTimestamp()
        });
        const changes = Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(', ');
        await logSystemEvent(adminUser, 'update', 'User', userId, `Datos de usuario actualizados. Cambios: ${changes}.`);

    } catch (error) {
        console.error("Error actualizando usuario en Firestore:", error);
        throw error;
    }
  };

  const logout = async () => {
    const userLoggingOut = currentUser;
    setLoading(true); // Set loading true before logout
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
      throw error;
    } finally {
        setLoading(false); // Ensure loading is set to false
    }
  };

  const getAllUsers = async (): Promise<User[]> => {
    try {
      const usersCollectionRef = collection(db, "users");
      const querySnapshot = await getDocs(usersCollectionRef);
      const usersList = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        // Ensure createdAt is handled as a string, convert if it's a Timestamp
        let createdAtStr = new Date().toISOString(); // Fallback
        if (data.createdAt instanceof Date) {
            createdAtStr = data.createdAt.toISOString();
        } else if (data.createdAt && typeof data.createdAt.toDate === 'function') { // Firestore Timestamp
            createdAtStr = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === 'string') { // Already a string
            createdAtStr = data.createdAt;
        }

        return {
            id: docSnap.id,
            name: data.name || "Nombre Desconocido",
            email: data.email || "Email Desconocido",
            avatarUrl: data.avatarUrl || null,
            role: data.role || DEFAULT_USER_ROLE,
            createdAt: createdAtStr,
            // groups can be added if defined in your User type and Firestore
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
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

    
