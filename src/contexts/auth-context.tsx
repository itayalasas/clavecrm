
"use client";

import { createContext, useState, useEffect, useContext, type ReactNode, useCallback } from 'react';
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

const LICENSE_VALIDATION_ENDPOINT = "https://studio--licensekeygenius-18qwi.us-central1.hosted.app/api/validate-license"; // Asegúrate que esta sea la URL correcta


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

  const getAllUsers = useCallback(async (): Promise<User[]> => {
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
      throw error;
    }
  }, [toast]);

  const performLicenseRevalidation = useCallback(async (storedKey: string, storedProjectId?: string) => {
    console.log("AuthProvider: Iniciando revalidación de licencia...");
    if (!storedKey) {
        console.log("AuthProvider: No hay clave de licencia almacenada para revalidar.");
        // Si no hay clave, podría ser 'not_configured' o mantener el estado actual si ya era un error.
        // Por seguridad, si no hay clave, podríamos marcarlo como 'not_configured'.
        const newStoredInfo: StoredLicenseInfo = {
            licenseKey: '',
            lastValidatedAt: new Date().toISOString(),
            status: 'NotChecked',
            validationResponse: null,
            projectId: storedProjectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO"
        };
        await setDoc(doc(db, "settings", "licenseConfiguration"), newStoredInfo, { merge: true });
        setLicenseInfo(newStoredInfo);
        return newStoredInfo;
    }

    const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";
    const projectIdToUse = storedProjectId || currentAppProjectId;

    try {
        const response = await fetch(LICENSE_VALIDATION_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey: storedKey, appId: projectIdToUse }),
        });

        let newStatus: StoredLicenseInfo['status'] = 'ApiError';
        let apiResponse: LicenseDetailsApiResponse | null = null;

        if (response.ok) {
            apiResponse = await response.json();
            if (apiResponse.isValid) {
                if (apiResponse.productId !== projectIdToUse) {
                    newStatus = 'Invalid'; // Mismatched project ID makes it invalid for this app
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
            projectId: projectIdToUse,
        };

        await setDoc(doc(db, "settings", "licenseConfiguration"), newStoredInfo, { merge: true });
        setLicenseInfo(newStoredInfo);
        console.log("AuthProvider: Revalidación completada. Nuevo estado almacenado:", newStatus, "Respuesta API:", apiResponse);
        window.dispatchEvent(new Event('authChanged')); // Notify layout or other components
        return newStoredInfo;
    } catch (error) {
        console.error("AuthProvider: Error de red durante la revalidación de licencia:", error);
        const errorStoredInfo: StoredLicenseInfo = {
            licenseKey: storedKey,
            lastValidatedAt: new Date().toISOString(),
            status: 'ApiError',
            validationResponse: null,
            projectId: projectIdToUse,
        };
        await setDoc(doc(db, "settings", "licenseConfiguration"), errorStoredInfo, { merge: true });
        setLicenseInfo(errorStoredInfo);
        window.dispatchEvent(new Event('authChanged'));
        return errorStoredInfo;
    }
  }, []); // No dependencies, so it uses the latest values from closure

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
      let currentStoredLicenseInfo: StoredLicenseInfo | null = null;
      let allUsersList: User[] = [];
      let newEffectiveStatus: EffectiveLicenseStatus = 'pending';
      const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";

      try {
        const licenseDocRef = doc(db, "settings", "licenseConfiguration");
        const licenseDocSnap = await getDoc(licenseDocRef);
        
        if (licenseDocSnap.exists()) {
          currentStoredLicenseInfo = licenseDocSnap.data() as StoredLicenseInfo;
          
          const today = new Date().toISOString().split('T')[0];
          const lastValidatedDate = currentStoredLicenseInfo.lastValidatedAt ? new Date(currentStoredLicenseInfo.lastValidatedAt).toISOString().split('T')[0] : null;

          if (lastValidatedDate !== today && currentStoredLicenseInfo.licenseKey) {
            console.log("AuthProvider: Licencia no validada hoy. Realizando revalidación...");
            currentStoredLicenseInfo = await performLicenseRevalidation(currentStoredLicenseInfo.licenseKey, currentStoredLicenseInfo.projectId);
          }
        } else {
           // No license configured yet, attempt to create a default 'NotChecked' one
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
        setLicenseInfo(currentStoredLicenseInfo); // Set licenseInfo state regardless of revalidation outcome

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
          // License seems valid from API, now check user count
          try {
            allUsersList = await getAllUsers();
            setUserCount(allUsersList.length);
            if (validationResponse.maxUsers !== null && typeof validationResponse.maxUsers === 'number' && validationResponse.maxUsers > 0 && allUsersList.length > validationResponse.maxUsers) {
              newEffectiveStatus = 'user_limit_exceeded';
            } else {
              newEffectiveStatus = 'valid'; // All checks passed
            }
          } catch (userCountError) {
            console.error("Error fetching user count for license check:", userCountError);
            newEffectiveStatus = 'api_error'; // Treat as API error if user count fails
            setUserCount(null);
          }
        }
      } catch (licenseError) {
        console.error("Error fetching/validating license information:", licenseError);
        setLicenseInfo(null); // Clear licenseInfo on error
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
        
        try {
            const licenseDocRef = doc(db, "settings", "licenseConfiguration");
            const licenseDocSnap = await getDoc(licenseDocRef);
            if (licenseDocSnap.exists()) {
                currentLicenseInfo = licenseDocSnap.data() as StoredLicenseInfo;
                // Perform revalidation if needed (e.g., if triggered by license page save)
                if (currentLicenseInfo.licenseKey) {
                     // Directly revalidating as an action from UI might have updated the key
                    currentLicenseInfo = await performLicenseRevalidation(currentLicenseInfo.licenseKey, currentLicenseInfo.projectId);
                }
            } else {
                 currentLicenseInfo = {
                    licenseKey: '', lastValidatedAt: new Date().toISOString(), status: 'NotChecked', 
                    validationResponse: null, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO"
                };
                await setDoc(doc(db, "settings", "licenseConfiguration"), currentLicenseInfo, { merge: true });
            }
            setLicenseInfo(currentLicenseInfo);

            const validationResponse = currentLicenseInfo?.validationResponse;
            if (!currentLicenseInfo || currentLicenseInfo.status === 'NotChecked' || !validationResponse) newEffectiveStatus = 'not_configured';
            else if (currentLicenseInfo.status === 'ApiError') newEffectiveStatus = 'api_error';
            else if (validationResponse.productId !== currentLicenseInfo.projectId) newEffectiveStatus = 'mismatched_project_id';
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
  }, [adminUserForSignup, getAllUsers, toast, performLicenseRevalidation]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = { id: userCredential.user.uid, ...userDocSnap.data() } as User;
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
      setLoading(false); // Ensure loading is set to false on login error
      throw error;
    }
    // setLoading(false) será manejado por el efecto de onAuthStateChanged
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
        uid: newFirebaseUser.uid, // Storing uid is redundant as it's the doc ID
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
      
      if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid && adminPerformingSignup.email && adminPerformingSignup.password) {
          await signOut(auth);
          // Re-authenticate the admin. This assumes you have admin's pass, which is not ideal.
          // A better long-term solution is using Admin SDK for user creation via a Cloud Function.
          try {
            await signInWithEmailAndPassword(auth, adminPerformingSignup.email, adminPerformingSignup.password);
          } catch (reauthError) {
             console.error("AuthProvider: Error re-autenticando al admin:", reauthError);
             // Admin might need to log in manually if re-auth fails.
             // Forcing a full page reload or redirect to login might be necessary here.
             // window.location.reload(); // Or router.push('/login');
          }
      } else if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid) {
          // If admin's password is not available, sign out new user and the admin will need to manually log back in.
          await signOut(auth);
          console.warn("AuthProvider: Nuevo usuario creado. El administrador puede necesitar re-autenticarse.");
          toast({title: "Acción Requerida", description: "Nuevo usuario creado. Por favor, re-autentícate como administrador.", duration: 10000});
          // router.push('/login'); // Optionally redirect admin to login
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
        window.dispatchEvent(new Event('authChanged')); // To re-fetch user count and license status

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
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
