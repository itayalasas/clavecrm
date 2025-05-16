
"use client";

import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
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
import { parseISO, isValid, format } from 'date-fns'; // Import parseISO and isValid

const LICENSE_VALIDATION_ENDPOINT = "https://studio--licensekeygenius-18qwi.us-central1.hosted.app/api/validate-license";

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

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = React.useState<FirebaseUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();
  const [adminUserForSignup, setAdminUserForSignup] = React.useState<User | null>(null);

  const [licenseInfo, setLicenseInfo] = React.useState<StoredLicenseInfo | null>(null);
  const [effectiveLicenseStatus, setEffectiveLicenseStatus] = React.useState<EffectiveLicenseStatus>('pending');
  const [userCount, setUserCount] = React.useState<number | null>(null);

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
            createdAtStr = (data.createdAt as Timestamp).toDate().toISOString();
        } else if (typeof data.createdAt === 'string') {
            const parsedDate = parseISO(data.createdAt);
            if (isValid(parsedDate)) {
                createdAtStr = parsedDate.toISOString();
            }
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
      throw error;
    }
  }, [toast]);

  const performLicenseRevalidation = React.useCallback(async (storedKey: string, storedProjectId?: string) => {
    console.log("AuthProvider: Iniciando revalidación de licencia...");
    const currentAppProjectIdToUse = storedProjectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";

    if (!storedKey) {
        console.log("AuthProvider: No hay clave de licencia almacenada para revalidar.");
        const newStoredInfo: StoredLicenseInfo = {
            licenseKey: '',
            lastValidatedAt: new Date().toISOString(),
            status: 'NotChecked',
            validationResponse: null,
            projectId: currentAppProjectIdToUse
        };
        try {
            await setDoc(doc(db, "settings", "licenseConfiguration"), newStoredInfo, { merge: true });
        } catch (dbError) {
            console.error("AuthProvider: Error guardando estado de licencia 'NotChecked':", dbError);
        }
        setLicenseInfo(newStoredInfo);
        return newStoredInfo;
    }

    try {
        const response = await fetch(LICENSE_VALIDATION_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey: storedKey, appId: currentAppProjectIdToUse }),
        });

        let newStatus: StoredLicenseInfo['status'] = 'ApiError';
        let apiResponse: LicenseDetailsApiResponse | null = null;

        if (response.ok) {
            apiResponse = await response.json();
            if (apiResponse.isValid) {
                if (apiResponse.productId !== currentAppProjectIdToUse) {
                    newStatus = 'Invalid';
                } else if (apiResponse.expiresAt && new Date(apiResponse.expiresAt) < new Date()) {
                    newStatus = 'Expired';
                } else {
                    newStatus = 'Valid';
                }
            } else {
                newStatus = 'Invalid';
            }
        } else {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            console.error(`AuthProvider: Error del servidor de licencias (${response.status}): ${errorData.message || response.statusText}`);
            newStatus = 'ApiError';
        }

        const newStoredInfo: StoredLicenseInfo = {
            licenseKey: storedKey,
            lastValidatedAt: new Date().toISOString(),
            status: newStatus,
            validationResponse: apiResponse,
            projectId: currentAppProjectIdToUse,
        };

        await setDoc(doc(db, "settings", "licenseConfiguration"), newStoredInfo, { merge: true });
        setLicenseInfo(newStoredInfo);
        console.log("AuthProvider: Revalidación completada. Nuevo estado almacenado:", newStatus, "Respuesta API:", apiResponse);
        return newStoredInfo;
    } catch (error) {
        console.error("AuthProvider: Error de red durante la revalidación de licencia:", error);
        const errorStoredInfo: StoredLicenseInfo = {
            licenseKey: storedKey,
            lastValidatedAt: new Date().toISOString(),
            status: 'ApiError',
            validationResponse: null,
            projectId: currentAppProjectIdToUse,
        };
        await setDoc(doc(db, "settings", "licenseConfiguration"), errorStoredInfo, { merge: true }).catch(dbError => console.error("Error guardando estado de error de licencia:", dbError));
        setLicenseInfo(errorStoredInfo);
        return errorStoredInfo;
    }
  }, []);


  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      let fetchedUser: User | null = null;
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            let createdAtStr = new Date().toISOString(); // Default
            if (data.createdAt instanceof Date) {
                createdAtStr = data.createdAt.toISOString();
            } else if (data.createdAt && typeof data.createdAt.toDate === 'function') { // Firestore Timestamp
                createdAtStr = (data.createdAt as Timestamp).toDate().toISOString();
            } else if (typeof data.createdAt === 'string') { // Already an ISO string
                 const parsedDate = parseISO(data.createdAt);
                 if (isValid(parsedDate)) {
                    createdAtStr = parsedDate.toISOString();
                 }
            }
            fetchedUser = { id: user.uid, ...data, createdAt: createdAtStr } as User;
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
      let currentStoredLicenseInfo: StoredLicenseInfo | null = null;
      let allUsersList: User[] = [];
      let newEffectiveStatus: EffectiveLicenseStatus = 'pending';
      const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";

      try {
        const licenseDocRef = doc(db, "settings", "licenseConfiguration");
        const licenseDocSnap = await getDoc(licenseDocRef);
        
        if (licenseDocSnap.exists()) {
          currentStoredLicenseInfo = licenseDocSnap.data() as StoredLicenseInfo;
          
          const today = format(new Date(), 'yyyy-MM-dd');
          let lastValidatedDateString = null;
          if (currentStoredLicenseInfo.lastValidatedAt && typeof currentStoredLicenseInfo.lastValidatedAt === 'string') {
              const parsedLastValidated = parseISO(currentStoredLicenseInfo.lastValidatedAt);
              if (isValid(parsedLastValidated)) {
                  lastValidatedDateString = format(parsedLastValidated, 'yyyy-MM-dd');
              }
          }

          if (lastValidatedDateString !== today && currentStoredLicenseInfo.licenseKey) {
            console.log("AuthProvider: Licencia no validada hoy. Realizando revalidación...");
            currentStoredLicenseInfo = await performLicenseRevalidation(currentStoredLicenseInfo.licenseKey, currentStoredLicenseInfo.projectId);
          }
        } else {
           currentStoredLicenseInfo = {
                licenseKey: '',
                lastValidatedAt: new Date().toISOString(),
                status: 'NotChecked',
                validationResponse: null,
                projectId: currentAppProjectId
            };
            await setDoc(doc(db, "settings", "licenseConfiguration"), currentStoredLicenseInfo, { merge: true });
            console.log("AuthProvider: No hay configuración de licencia, creando una por defecto como 'NotChecked'.");
        }
        setLicenseInfo(currentStoredLicenseInfo);

        const validationResponse = currentStoredLicenseInfo?.validationResponse;

        if (!currentStoredLicenseInfo || currentStoredLicenseInfo.status === 'NotChecked' || !validationResponse) {
          newEffectiveStatus = 'not_configured';
        } else if (currentStoredLicenseInfo.status === 'ApiError') {
          newEffectiveStatus = 'api_error';
        } else if (validationResponse.productId !== currentStoredLicenseInfo.projectId) {
          newEffectiveStatus = 'mismatched_project_id';
        } else if (!validationResponse.isValid) {
          newEffectiveStatus = 'invalid_key';
        } else if (validationResponse.expiresAt && new Date(validationResponse.expiresAt) < new Date()) {
          newEffectiveStatus = 'expired';
        } else {
          try {
            allUsersList = await getAllUsers();
            setUserCount(allUsersList.length);
            if (validationResponse.maxUsers !== null && typeof validationResponse.maxUsers === 'number' && validationResponse.maxUsers > 0 && allUsersList.length > validationResponse.maxUsers) {
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
      } catch (licenseError) {
        console.error("Error fetching/validating license information:", licenseError);
        setLicenseInfo(null);
        newEffectiveStatus = 'api_error';
      }
      
      console.log("AuthProvider: Effective license status determined:", newEffectiveStatus);
      setEffectiveLicenseStatus(newEffectiveStatus);
      setLoading(false);
    });
    
    const handleAuthChangeRecheck = async () => {
        setLoading(true);
        let currentLicenseInfo: StoredLicenseInfo | null = null;
        let allUsersList: User[] = [];
        let newEffectiveStatus: EffectiveLicenseStatus = 'not_configured';
        const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";
        
        try {
            const licenseDocRef = doc(db, "settings", "licenseConfiguration");
            const licenseDocSnap = await getDoc(licenseDocRef);
            if (licenseDocSnap.exists()) {
                currentLicenseInfo = licenseDocSnap.data() as StoredLicenseInfo;
                if (currentLicenseInfo.licenseKey) {
                    currentLicenseInfo = await performLicenseRevalidation(currentLicenseInfo.licenseKey, currentLicenseInfo.projectId || currentAppProjectId);
                }
            } else {
                 currentLicenseInfo = {
                    licenseKey: '', lastValidatedAt: new Date().toISOString(), status: 'NotChecked', 
                    validationResponse: null, projectId: currentAppProjectId
                };
                await setDoc(doc(db, "settings", "licenseConfiguration"), currentLicenseInfo, { merge: true });
            }
            setLicenseInfo(currentLicenseInfo);

            const validationResponse = currentLicenseInfo?.validationResponse;
            if (!currentLicenseInfo || currentLicenseInfo.status === 'NotChecked' || !validationResponse) newEffectiveStatus = 'not_configured';
            else if (currentLicenseInfo.status === 'ApiError') newEffectiveStatus = 'api_error';
            else if (validationResponse.productId !== (currentLicenseInfo.projectId || currentAppProjectId) ) newEffectiveStatus = 'mismatched_project_id';
            else if (!validationResponse.isValid) newEffectiveStatus = 'invalid_key';
            else if (validationResponse.expiresAt && new Date(validationResponse.expiresAt) < new Date()) newEffectiveStatus = 'expired';
            else {
                allUsersList = await getAllUsers();
                setUserCount(allUsersList.length);
                if (validationResponse.maxUsers !== null && typeof validationResponse.maxUsers === 'number' && validationResponse.maxUsers > 0 && allUsersList.length > validationResponse.maxUsers) {
                    newEffectiveStatus = 'user_limit_exceeded';
                } else {
                    newEffectiveStatus = 'valid';
                }
            }
        } catch (e) {
            console.error("AuthProvider: Error during explicit re-check:", e);
            setLicenseInfo(null); newEffectiveStatus = 'api_error';
        }
        setEffectiveLicenseStatus(newEffectiveStatus);
        setLoading(false);
    };
    window.addEventListener('authChanged', handleAuthChangeRecheck);

    return () => {
      unsubscribe();
      window.removeEventListener('authChanged', handleAuthChangeRecheck);
    }
  }, [adminUserForSignup, getAllUsers, toast, performLicenseRevalidation]); // Added performLicenseRevalidation to dependency array

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
         let createdAtStr = new Date().toISOString(); // Default
        if (data.createdAt instanceof Date) {
            createdAtStr = data.createdAt.toISOString();
        } else if (data.createdAt && typeof data.createdAt.toDate === 'function') { // Firestore Timestamp
            createdAtStr = (data.createdAt as Timestamp).toDate().toISOString();
        } else if (typeof data.createdAt === 'string') { // Already an ISO string
            const parsedDate = parseISO(data.createdAt);
            if (isValid(parsedDate)) {
                createdAtStr = parsedDate.toISOString();
            }
        }
        const userData = { id: userCredential.user.uid, ...data, createdAt: createdAtStr } as User;
         if (userData) {
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
  };

  const signup = async (email: string, pass: string, name: string, roleParam?: UserRole): Promise<FirebaseUser | null> => {
    const adminPerformingSignup = currentUser; 
    if (!adminPerformingSignup) {
        toast({ title: "Error de Permisos", description: "Solo un administrador autenticado puede crear nuevos usuarios.", variant: "destructive"});
        return null;
    }
    
    setAdminUserForSignup(adminPerformingSignup);
    let newFirebaseUser: FirebaseUser | null = null;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      newFirebaseUser = userCredential.user;

      const userDocRef = doc(db, "users", newFirebaseUser.uid);
      const role = roleParam || DEFAULT_USER_ROLE;
      const newUserFirestoreData = {
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
            description: `Se creó ${name}, pero falló el envío del correo de verificación.`,
            variant: "default",
            duration: 7000,
        });
      }
      await logSystemEvent(adminPerformingSignup, 'create', 'User', newFirebaseUser.uid, `Usuario ${name} (${email}) creado con rol ${role}.`);
      
      // Re-login admin - This logic has known issues and is a temporary workaround.
      // Proper admin user creation should ideally happen via a secure backend (e.g., Admin SDK in Cloud Function).
      if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid && adminPerformingSignup.email && adminPerformingSignup.password) {
          await signOut(auth); 
          try {
            await signInWithEmailAndPassword(auth, adminPerformingSignup.email, adminPerformingSignup.password);
          } catch (reauthError) {
             console.error("AuthProvider: Error re-autenticando al admin:", reauthError);
             // window.location.reload(); // Or router.push('/login');
          }
      } else if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid) {
          await signOut(auth);
          console.warn("AuthProvider: Nuevo usuario creado. El administrador puede necesitar re-autenticarse.");
          toast({title: "Acción Requerida", description: "Nuevo usuario creado. Por favor, re-autentícate como administrador.", duration: 10000});
      }
      window.dispatchEvent(new Event('authChanged'));
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
      setAdminUserForSignup(null);
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
        window.dispatchEvent(new Event('authChanged'));

    } catch (error) {
        console.error("Error actualizando usuario en Firestore:", error);
        throw error;
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
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
