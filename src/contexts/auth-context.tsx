
"use client";

import { createContext, useState, useEffect, useContext, type ReactNode } from 'react';
import * as React from 'react'; // Keep for other React specific needs if any, or could be removed if all used React parts are explicitly imported.
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User, UserRole, StoredLicenseInfo, EffectiveLicenseStatus, LicenseDetailsApiResponse } from '@/lib/types';
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
  licenseInfo: StoredLicenseInfo | null;
  effectiveLicenseStatus: EffectiveLicenseStatus;
  userCount: number | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [adminUserForSignup, setAdminUserForSignup] = useState<User | null>(null);

  const [licenseInfo, setLicenseInfo] = useState<StoredLicenseInfo | null>(null);
  const [effectiveLicenseStatus, setEffectiveLicenseStatus] = useState<EffectiveLicenseStatus>('pending');
  const [userCount, setUserCount] = useState<number | null>(null);

  const getAllUsers = React.useCallback(async (): Promise<User[]> => {
    try {
      const usersCollectionRef = collection(db, "users");
      const querySnapshot = await getDocs(usersCollectionRef);
      const usersList = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let createdAtStr = new Date().toISOString();
        if (data.createdAt instanceof Date) {
            createdAtStr = data.createdAt.toISOString();
        } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            createdAtStr = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === 'string') {
            createdAtStr = data.createdAt;
        }

        return {
            id: docSnap.id,
            name: data.name || "Nombre Desconocido",
            email: data.email || "Email Desconocido",
            avatarUrl: data.avatarUrl || null,
            role: data.role || DEFAULT_USER_ROLE,
            createdAt: createdAtStr,
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
      throw error; // Re-throw so caller knows about the error
    }
  }, [toast]); // Added toast as a dependency

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      let fetchedUser: User | null = null;
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            fetchedUser = { id: user.uid, ...userDocSnap.data() } as User;
            setCurrentUser(fetchedUser);
            if (adminUserForSignup && adminUserForSignup.id === user.uid) {
              setAdminUserForSignup(null);
            }
          } else {
             console.warn(`Firestore document for user UID ${user.uid} not found.`);
             setCurrentUser(null);
          }
        } catch (dbError) {
            console.error("Error fetching user document from Firestore:", dbError);
            setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
        setAdminUserForSignup(null);
      }

      // License and user count logic
      let currentLicenseInfo: StoredLicenseInfo | null = null;
      let allUsersList: User[] = [];
      let newEffectiveStatus: EffectiveLicenseStatus = 'not_configured';
      const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      try {
        const licenseDocRef = doc(db, "settings", "licenseConfiguration");
        const licenseDocSnap = await getDoc(licenseDocRef);
        if (licenseDocSnap.exists()) {
          currentLicenseInfo = licenseDocSnap.data() as StoredLicenseInfo;
          setLicenseInfo(currentLicenseInfo);
          
          const validationResponse = currentLicenseInfo.validationResponse;

          if (currentLicenseInfo.status === 'ApiError') {
            newEffectiveStatus = 'api_error';
          } else if (currentLicenseInfo.status === 'NotChecked' || !validationResponse) {
            newEffectiveStatus = 'not_configured'; 
          } else {
            if (validationResponse.productId !== currentLicenseInfo.projectId) { // Check against projectId stored with license
              newEffectiveStatus = 'mismatched_project_id';
            } else if (!validationResponse.isValid) {
              newEffectiveStatus = 'invalid_key';
            } else if (validationResponse.expiresAt && new Date(validationResponse.expiresAt) < new Date()) {
              newEffectiveStatus = 'expired';
            } else {
              try {
                allUsersList = await getAllUsers(); // Use the memoized getAllUsers
                setUserCount(allUsersList.length);

                if (validationResponse.maxUsers !== null && typeof validationResponse.maxUsers === 'number' && allUsersList.length > validationResponse.maxUsers) {
                  newEffectiveStatus = 'user_limit_exceeded';
                } else {
                  newEffectiveStatus = 'valid';
                }
              } catch (userCountError) {
                console.error("Error fetching user count for license check:", userCountError);
                newEffectiveStatus = 'api_error'; 
                setUserCount(null);
              }
            }
          }
        } else {
          setLicenseInfo(null);
          newEffectiveStatus = 'not_configured';
        }
      } catch (licenseError) {
        console.error("Error fetching license information:", licenseError);
        setLicenseInfo(null);
        newEffectiveStatus = 'api_error';
      }
      setEffectiveLicenseStatus(newEffectiveStatus);
      setLoading(false); 
    });
    
    const handleAuthChangeRecheck = () => { // Renamed to avoid conflict
        // This event listener is intended to allow other parts of the app to trigger a re-check.
        // The core logic is within onAuthStateChanged.
        // Forcing a re-fetch might be needed if license is updated elsewhere and context needs refresh.
        // However, the primary driver of context update for auth state is onAuthStateChanged.
        // If license is stored in Firestore and updated, ideally components would re-fetch or listen to Firestore.
        // For now, just re-triggering the onAuthStateChanged logic (if possible, or simply re-fetching license data)
        // might be what's intended by 'authChanged' event.
        
        // This is a simplified re-check. A more robust solution might involve
        // re-calling the license and user count fetching logic directly.
        const recheck = async () => {
            setLoading(true); // Indicate re-checking
            // Re-fetch license and user count
            let currentLicenseInfo: StoredLicenseInfo | null = null;
            let allUsersList: User[] = [];
            let newEffectiveStatus: EffectiveLicenseStatus = 'not_configured';
            // const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID; // Already defined above
            try {
                const licenseDocRef = doc(db, "settings", "licenseConfiguration");
                const licenseDocSnap = await getDoc(licenseDocRef);
                if (licenseDocSnap.exists()) {
                currentLicenseInfo = licenseDocSnap.data() as StoredLicenseInfo;
                setLicenseInfo(currentLicenseInfo);
                
                const validationResponse = currentLicenseInfo.validationResponse;
                if (currentLicenseInfo.status === 'ApiError') newEffectiveStatus = 'api_error';
                else if (currentLicenseInfo.status === 'NotChecked' || !validationResponse) newEffectiveStatus = 'not_configured';
                else {
                    if (validationResponse.productId !== currentLicenseInfo.projectId) newEffectiveStatus = 'mismatched_project_id';
                    else if (!validationResponse.isValid) newEffectiveStatus = 'invalid_key';
                    else if (validationResponse.expiresAt && new Date(validationResponse.expiresAt) < new Date()) newEffectiveStatus = 'expired';
                    else {
                        allUsersList = await getAllUsers();
                        setUserCount(allUsersList.length);
                        if (validationResponse.maxUsers !== null && typeof validationResponse.maxUsers === 'number' && allUsersList.length > validationResponse.maxUsers) {
                            newEffectiveStatus = 'user_limit_exceeded';
                        } else {
                            newEffectiveStatus = 'valid';
                        }
                    }
                }
                } else {
                    setLicenseInfo(null); newEffectiveStatus = 'not_configured';
                }
            } catch (e) {
                setLicenseInfo(null); newEffectiveStatus = 'api_error';
            }
            setEffectiveLicenseStatus(newEffectiveStatus);
            setLoading(false);
        };
        recheck();
    };
    window.addEventListener('authChanged', handleAuthChangeRecheck);

    return () => {
      unsubscribe();
      window.removeEventListener('authChanged', handleAuthChangeRecheck);
    }
  }, [adminUserForSignup, getAllUsers, toast]); // Added getAllUsers and toast as dependencies to useEffect for getAllUsers

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      // onAuthStateChanged will handle setting currentUser and fetching license
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = { id: userCredential.user.uid, ...userDocSnap.data() } as User;
         if (userData) { // Ensure userData is not null before logging
            await logSystemEvent(userData, 'login', 'User', userCredential.user.uid, `Usuario ${email} inició sesión.`);
        }
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
    // setLoading(false) will be called by onAuthStateChanged's effect
  };

  const signup = async (email: string, pass: string, name: string, roleParam?: UserRole): Promise<FirebaseUser | null> => {
    const adminPerformingSignup = currentUser; // Get current admin *before* potential re-authentication
    if (!adminPerformingSignup) {
        toast({ title: "Error de Permisos", description: "Solo un administrador autenticado puede crear nuevos usuarios.", variant: "destructive"});
        return null;
    }
    
    setAdminUserForSignup(adminPerformingSignup); // Store the admin user
    let newFirebaseUser: FirebaseUser | null = null;

    try {
      // This might sign out the current admin and sign in as the new user temporarily
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      newFirebaseUser = userCredential.user;

      const userDocRef = doc(db, "users", newFirebaseUser.uid);
      const role = roleParam || DEFAULT_USER_ROLE; // Ensure role has a value
      const newUserFirestoreData = {
        uid: newFirebaseUser.uid,
        email: newFirebaseUser.email,
        name: name,
        role: role,
        createdAt: serverTimestamp(),
        avatarUrl: `https://avatar.vercel.sh/${newFirebaseUser.email}.png`
      };
      await setDoc(userDocRef, newUserFirestoreData);

      try {
        await sendEmailVerification(newFirebaseUser);
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
      await logSystemEvent(adminPerformingSignup, 'create', 'User', newFirebaseUser.uid, `Usuario ${name} (${email}) creado con rol ${role}.`);
      
      // IMPORTANT: Sign out the newly created user and re-sign in the admin
      if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid) {
        await signOut(auth);
        // Attempt to re-authenticate the admin. This is tricky.
        // Ideally, admin operations are done via Admin SDK in Cloud Functions.
        // For client-side, this forces a state refresh.
        // The onAuthStateChanged listener will pick up the null user, then
        // the admin would need to log back in, or we'd need a mechanism to restore admin session.
        // For now, this simplifies by just signing out the new user. The admin might need to re-login if their session was lost.
        // Triggering a custom event for onAuthStateChanged to re-evaluate.
        window.dispatchEvent(new Event('authChanged'));
      }
      return newFirebaseUser;
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
      setAdminUserForSignup(null); // Reset admin placeholder on error
      // If the admin was signed out, they might need to re-login.
      // Trigger a re-check of auth state.
      window.dispatchEvent(new Event('authChanged'));
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
    try {
      await signOut(auth);
      // onAuthStateChanged will handle setting currentUser to null and updating license status
       if (userLoggingOut) { // Ensure userLoggingOut is not null
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

  return (
    <AuthContext.Provider value={{ 
        currentUser, 
        firebaseUser, 
        loading, 
        login, 
        signup, 
        logout, 
        getAllUsers, 
        updateUserInFirestore,
        licenseInfo,
        effectiveLicenseStatus,
        userCount
    }}>
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

    