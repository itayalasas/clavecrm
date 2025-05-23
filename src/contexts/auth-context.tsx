
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
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp, Timestamp, updateDoc, query, where, onSnapshot } from 'firebase/firestore'; // Added query, where, onSnapshot
import { auth, db } from '@/lib/firebase';
import type { User, UserRole, StoredLicenseInfo, EffectiveLicenseStatus, LicenseDetailsApiResponse } from '@/lib/types';
import { DEFAULT_USER_ROLE } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { logSystemEvent } from '@/lib/auditLogger';
import { parseISO, isValid, format } from 'date-fns';

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
  unreadInboxCount: number | null;
  isLoadingUnreadCount: boolean;
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
  const [unreadInboxCount, setUnreadInboxCount] = React.useState<number | null>(0);
  const [isLoadingUnreadCount, setIsLoadingUnreadCount] = React.useState(true);

  const getAllUsers = React.useCallback(async (): Promise<User[]> => {
    try {
      const usersCollectionRef = collection(db, "users");
      const querySnapshot = await getDocs(usersCollectionRef);
      const usersList = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let createdAtStr = new Date().toISOString();
        if (data.createdAt instanceof Timestamp) {
            createdAtStr = data.createdAt.toDate().toISOString();
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
                    newStatus = 'MismatchedProjectId';
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
    let unsubscribeUnreadCount: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      let fetchedUser: User | null = null;
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            let createdAtStr = new Date().toISOString();
            if (data.createdAt instanceof Timestamp) {
                createdAtStr = data.createdAt.toDate().toISOString();
            } else if (typeof data.createdAt === 'string') {
                const parsedDate = parseISO(data.createdAt);
                if (isValid(parsedDate)) {
                    createdAtStr = parsedDate.toISOString();
                } else {
                   console.warn(`AuthProvider: Invalid createdAt string for user ${user.uid}: ${data.createdAt}`);
                }
            } else if (data.createdAt) { // Could be an old JS Date object if not properly converted before
                createdAtStr = new Date(data.createdAt).toISOString();
            }

            fetchedUser = {
                id: user.uid,
                name: data.name || (console.warn(`AuthProvider: El campo 'name' falta en Firestore para el usuario UID ${user.uid}. Usando displayName o email como fallback.`), user.displayName || user.email || "Usuario"),
                email: data.email || user.email || "",
                avatarUrl: data.avatarUrl || user.photoURL || null,
                role: data.role || DEFAULT_USER_ROLE,
                createdAt: createdAtStr
            } as User;
            setCurrentUser(fetchedUser);
            if (adminUserForSignup && adminUserForSignup.id === user.uid) {
              setAdminUserForSignup(null);
            }

            // Fetch unread email count if user is logged in
            setIsLoadingUnreadCount(true);
            const unreadQuery = query(
              collection(db, "incomingEmails"),
              where("isRead", "==", false)
              // Potentially add: where("crmRecipientUserId", "==", user.uid) if you implement user-specific inboxes
            );
            unsubscribeUnreadCount = onSnapshot(unreadQuery, (snapshot) => {
              setUnreadInboxCount(snapshot.size);
              setIsLoadingUnreadCount(false);
            }, (error) => {
              console.error("Error fetching unread email count:", error);
              setUnreadInboxCount(0);
              setIsLoadingUnreadCount(false);
            });


          } else {
             console.warn(`Firestore document for user UID ${user.uid} not found.`);
             setCurrentUser(null);
             if (unsubscribeUnreadCount) unsubscribeUnreadCount();
             setUnreadInboxCount(0);
             setIsLoadingUnreadCount(false);
          }
        } catch (dbError) {
            console.error("Error fetching user document from Firestore:", dbError);
            setCurrentUser(null);
            if (unsubscribeUnreadCount) unsubscribeUnreadCount();
            setUnreadInboxCount(0);
            setIsLoadingUnreadCount(false);
        }
      } else {
        setCurrentUser(null);
        setAdminUserForSignup(null);
        if (unsubscribeUnreadCount) unsubscribeUnreadCount();
        setUnreadInboxCount(0);
        setIsLoadingUnreadCount(false);
      }

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
        } else if (validationResponse.productId !== (currentStoredLicenseInfo.projectId || currentAppProjectId)) {
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
            newEffectiveStatus = 'api_error'; // Or some other status indicating inability to verify this part
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
        setLoading(true); // Indicate loading during recheck
        let currentLicenseInfo: StoredLicenseInfo | null = null;
        let allUsersList: User[] = [];
        let newEffectiveStatus: EffectiveLicenseStatus = 'not_configured'; // Default status
        const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";
        
        try {
            const licenseDocRef = doc(db, "settings", "licenseConfiguration");
            const licenseDocSnap = await getDoc(licenseDocRef);
            if (licenseDocSnap.exists()) {
                currentLicenseInfo = licenseDocSnap.data() as StoredLicenseInfo;
                // Force revalidation if a license key exists
                if (currentLicenseInfo.licenseKey) {
                    console.log("AuthProvider (recheck): Forcing license revalidation due to authChanged event.");
                    currentLicenseInfo = await performLicenseRevalidation(currentLicenseInfo.licenseKey, currentLicenseInfo.projectId || currentAppProjectId);
                }
            } else {
                 // If no license config exists, create a default one
                 currentLicenseInfo = {
                    licenseKey: '', lastValidatedAt: new Date().toISOString(), status: 'NotChecked', 
                    validationResponse: null, projectId: currentAppProjectId
                };
                await setDoc(doc(db, "settings", "licenseConfiguration"), currentLicenseInfo, { merge: true });
            }
            setLicenseInfo(currentLicenseInfo);

            // Determine effective status based on (potentially new) licenseInfo
            const validationResponse = currentLicenseInfo?.validationResponse;
            if (!currentLicenseInfo || currentLicenseInfo.status === 'NotChecked' || !validationResponse) newEffectiveStatus = 'not_configured';
            else if (currentLicenseInfo.status === 'ApiError') newEffectiveStatus = 'api_error';
            else if (validationResponse.productId !== (currentLicenseInfo.projectId || currentAppProjectId) ) newEffectiveStatus = 'mismatched_project_id';
            else if (!validationResponse.isValid) newEffectiveStatus = 'invalid_key';
            else if (validationResponse.expiresAt && new Date(validationResponse.expiresAt) < new Date()) newEffectiveStatus = 'expired';
            else {
                allUsersList = await getAllUsers(); // Fetch current user count
                setUserCount(allUsersList.length);
                if (validationResponse.maxUsers !== null && typeof validationResponse.maxUsers === 'number' && validationResponse.maxUsers > 0 && allUsersList.length > validationResponse.maxUsers) {
                    newEffectiveStatus = 'user_limit_exceeded';
                } else {
                    newEffectiveStatus = 'valid';
                }
            }
        } catch (e) {
            console.error("AuthProvider: Error during explicit re-check:", e);
            setLicenseInfo(null); // Reset license info on error
            newEffectiveStatus = 'api_error';
        }
        setEffectiveLicenseStatus(newEffectiveStatus);
        setLoading(false);
    };

    window.addEventListener('authChanged', handleAuthChangeRecheck);

    return () => {
      unsubscribeAuth();
      if (unsubscribeUnreadCount) unsubscribeUnreadCount();
      window.removeEventListener('authChanged', handleAuthChangeRecheck);
    }
  }, [adminUserForSignup, getAllUsers, toast, performLicenseRevalidation]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      // The onAuthStateChanged listener will handle fetching Firestore user data and setting currentUser
      // Log login event (optional: wait for onAuthStateChanged to set currentUser if you need user name for log)
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
         let createdAtStr = new Date().toISOString(); // Default
        if (data.createdAt instanceof Timestamp) {
            createdAtStr = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === 'string') {
            const parsedDate = parseISO(data.createdAt);
            if (isValid(parsedDate)) {
                createdAtStr = parsedDate.toISOString();
            }
        }
        const userData = { id: userCredential.user.uid, ...data, createdAt: createdAtStr } as User;
         if (userData) { // ensure userData is not null before logging
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
      setLoading(false); // Ensure loading is set to false on error
      throw error; // Re-throw to allow caller to handle
    }
    // setLoading(false) will be handled by onAuthStateChanged
  };

  const signup = async (email: string, pass: string, name: string, roleParam?: UserRole): Promise<FirebaseUser | null> => {
    const adminPerformingSignup = currentUser; 
    if (!adminPerformingSignup) {
        toast({ title: "Error de Permisos", description: "Solo un administrador autenticado puede crear nuevos usuarios.", variant: "destructive"});
        return null;
    }
    
    setAdminUserForSignup(adminPerformingSignup); // Store current admin to re-login later
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
        createdAt: serverTimestamp(), // Use serverTimestamp
        avatarUrl: `https://avatar.vercel.sh/${newFirebaseUser.email}.png` // Example avatar
      };
      await setDoc(userDocRef, newUserFirestoreData);

      // Attempt to send email verification
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
            description: `Se creó ${name}, pero falló el envío del correo de verificación. Puede que necesite configurar reglas de correo o que la cuenta de correo no sea válida para la verificación de Firebase.`,
            variant: "default", // Use default variant for warning-like info
            duration: 7000,
        });
      }
      await logSystemEvent(adminPerformingSignup, 'create', 'User', newFirebaseUser.uid, `Usuario ${name} (${email}) creado con rol ${role}.`);
      
      // This is a workaround. Proper admin user creation should use Admin SDK.
      if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid && adminPerformingSignup.email && adminPerformingSignup.password) {
          console.log("AuthProvider: Re-authenticating admin after new user creation...");
          await signOut(auth); // Sign out the newly created user (who is currently logged in)
          try {
            // Re-login the admin
            await signInWithEmailAndPassword(auth, adminPerformingSignup.email, adminPerformingSignup.password);
            console.log("AuthProvider: Admin re-authenticated successfully.");
          } catch (reauthError) {
             console.error("AuthProvider: Error re-authenticating admin:", reauthError);
             // Handle re-authentication error, e.g., redirect to login
             // This is critical, as the admin might be logged out.
             // router.push('/login'); // Assuming router is available or passed
             window.dispatchEvent(new Event('authChanged')); // Trigger state re-check anyway
          }
      } else if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid) {
          // If admin's password isn't available for re-login (which it shouldn't be)
          await signOut(auth);
          console.warn("AuthProvider: Nuevo usuario creado. El administrador puede necesitar re-autenticarse manualmente.");
          toast({title: "Acción Requerida", description: "Nuevo usuario creado. Por favor, re-autentícate como administrador si has sido deslogueado.", duration: 10000});
          window.dispatchEvent(new Event('authChanged'));
      } else {
         // Admin was not the one logged out, no need to re-login admin.
         // Just trigger a re-check for current user data.
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
      setAdminUserForSignup(null); // Clear admin temp storage on error
      window.dispatchEvent(new Event('authChanged')); // Ensure state re-check even on error
      throw error; // Re-throw to allow caller to handle
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
            updatedAt: serverTimestamp() // Use serverTimestamp
        });
        const changes = Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(', ');
        await logSystemEvent(adminUser, 'update', 'User', userId, `Datos de usuario actualizados. Cambios: ${changes}.`);
        // Optionally, trigger a re-fetch of all users if your user list page needs it,
        // or rely on onSnapshot if the user list page uses it.
        window.dispatchEvent(new Event('authChanged')); // This will trigger a re-fetch of currentUser and license

    } catch (error) {
        console.error("Error actualizando usuario en Firestore:", error);
        throw error;
    }
  };

  const logout = async () => {
    const userLoggingOut = currentUser; // Capture currentUser before it's nulled by onAuthStateChanged
    try {
      await signOut(auth);
      // onAuthStateChanged will handle setting currentUser to null
       if (userLoggingOut) { // Check if there was a user before logout
        await logSystemEvent(userLoggingOut, 'logout', 'User', userLoggingOut.id, `Usuario ${userLoggingOut.name} cerró sesión.`);
      }
    } catch (error: any) {
      console.error("Error en logout:", error);
       toast({
        title: "Error al Cerrar Sesión",
        description: "Ocurrió un error inesperado.",
        variant: "destructive",
      });
      throw error; // Re-throw to allow caller to handle
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
        userCount,
        unreadInboxCount,
        isLoadingUnreadCount
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
