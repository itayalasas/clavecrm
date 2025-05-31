"use client";

import * as React from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp, Timestamp, updateDoc, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase'; // Assuming your firebase instance is exported as 'db' from here
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
  hasPermission: (permission: string) => boolean;
  isUserDataLoaded: boolean; // Add this line
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = React.useState<FirebaseUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();
  const [isUserDataLoaded, setIsUserDataLoaded] = React.useState(false); // Add this line
  const [userPermissions, setUserPermissions] = React.useState<string[]>([]);
  
  const [licenseInfo, setLicenseInfo] = React.useState<StoredLicenseInfo | null>(null);
  const [effectiveLicenseStatus, setEffectiveLicenseStatus] = React.useState<EffectiveLicenseStatus>('pending');
  const [userCount, setUserCount] = React.useState<number | null>(null);
  const [unreadInboxCount, setUnreadInboxCount] = React.useState<number | null>(0);
  const [isLoadingUnreadCount, setIsLoadingUnreadCount] = React.useState(true);

  const getAllUsers = React.useCallback(async (): Promise<User[]> => {
    try {
      // 1. Fetch all roles first
      const rolesCollectionRef = collection(db, "roles");
      const rolesSnapshot = await getDocs(rolesCollectionRef);
      const rolesMap = new Map<string, any>();
      rolesSnapshot.docs.forEach(docSnap => {
        rolesMap.set(docSnap.id, docSnap.data());
      });

      // 2. Fetch users
      const usersCollectionRef = collection(db, "users");
      const querySnapshot = await getDocs(usersCollectionRef);
      const usersList = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let createdAtStr = new Date().toISOString();
        if (data.createdAt instanceof Timestamp) { // Handling Firestore Timestamp
            createdAtStr = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === 'string') {
            const parsedDate = parseISO(data.createdAt);
            if (isValid(parsedDate)) {
                createdAtStr = parsedDate.toISOString();
            } else {
              console.warn(`AuthProvider: Invalid createdAt string for user ${docSnap.id}: ${data.createdAt}`);
            }
        } else if (data.createdAt) { 
            createdAtStr = new Date(data.createdAt).toISOString();
        }

        const roleData = rolesMap.get(data.role);
        const roleName = roleData?.name || 'Rol Desconocido';

        return {
            id: docSnap.id,
            name: data.name || "Nombre Desconocido",
            email: data.email || "Email Desconocido",
            avatarUrl: data.avatarUrl || null,
            role: data.role || DEFAULT_USER_ROLE,
            roleName: roleName,
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

    const fetchAndSetUserPermissions = async (roleId: string) => {
      try {
        const roleDocRef = doc(db, "roles", roleId);
        const roleDocSnap = await getDoc(roleDocRef);
        if (roleDocSnap.exists()) {
          const roleData = roleDocSnap.data();
          setUserPermissions(roleData.permissions || []);
        } else {
          console.warn(`AuthProvider: Role document for ID ${roleId} not found. Setting empty permissions.`);
          setUserPermissions([]);
        }
        
      } catch (error) {
        console.error("Error fetching user permissions:", error);
        setUserPermissions([]);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setIsUserDataLoaded(false); // Set to false at the start of auth state change
      if (user) {
        let fetchedUser; // Declare fetchedUser here
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
            } else if (data.createdAt) { 
                createdAtStr = new Date(data.createdAt).toISOString();
            }

            fetchedUser = {
                id: user.uid,
                name: data.name || (console.warn(`AuthProvider: El campo 'name' falta en Firestore para el usuario UID ${user.uid}. Usando displayName o email como fallback.`), user.displayName || user.email || "Usuario"),
                email: data.email || user.email || "",
                avatarUrl: data.avatarUrl || user.photoURL || null,
                role: data.role || DEFAULT_USER_ROLE,
                createdAt: createdAtStr,
                tenantId: data.tenantId // PRIMERA CORRECCIÓN: Asegurar que tenantId se carga
            } as User;
            setCurrentUser(fetchedUser);
            await fetchAndSetUserPermissions(fetchedUser.role);
            setIsLoadingUnreadCount(true);
            const unreadQuery = query(
              collection(db, "incomingEmails"),
              where("crmUserId", "==", user.uid), // Filter by CRM user ID
              where("isRead", "==", false)
            );
            unsubscribeUnreadCount = onSnapshot(unreadQuery, (snapshot) => {
              setUnreadInboxCount(snapshot.size);
              setIsLoadingUnreadCount(false);
            }, (error) => {
              console.error("Error fetching unread email count:", error);
              setUnreadInboxCount(0);
              setIsLoadingUnreadCount(false);
            });

            setIsUserDataLoaded(true); // Set to true after user data is loaded
          } else {
             console.warn(`Firestore document for user UID ${user.uid} not found.`);
             setCurrentUser(null);
             setUserPermissions([]);
             if (unsubscribeUnreadCount) unsubscribeUnreadCount();
             setUnreadInboxCount(0);
             setIsLoadingUnreadCount(false);
             setIsUserDataLoaded(true); // Set to true even if no user doc is found
          }
        } catch (dbError) {
            console.error("Error fetching user document from Firestore:", dbError);
            setUserPermissions([]);
            setCurrentUser(null);
            if (unsubscribeUnreadCount) unsubscribeUnreadCount();
            setUnreadInboxCount(0);
            setIsUserDataLoaded(true); // Set to true even if there's a DB error
            setIsLoadingUnreadCount(false);
        }
      } else {
        setCurrentUser(null);
        setUserPermissions([]);
        if (unsubscribeUnreadCount) unsubscribeUnreadCount();
        setUnreadInboxCount(0);
        setIsLoadingUnreadCount(false);
        setIsUserDataLoaded(true); // Set to true when no user is authenticated
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
            newEffectiveStatus = 'api_error'; 
            setUserCount(null);
          }
        }
      } catch (licenseError) {
        setLicenseInfo(null);
        newEffectiveStatus = 'api_error';
      }
      
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
                    console.log("AuthProvider (recheck): Forcing license revalidation due to authChanged event.");
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
            setLicenseInfo(null); 
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
  }, [getAllUsers, toast, performLicenseRevalidation]);

  const hasPermission = React.useCallback((permission: string): boolean => {
    console.log(`Checking permission ${permission} for user role ${currentUser?.role}`);
    if (currentUser?.role === 'admin') {
      // Administrators have all permissions
      return true;
    }
    return userPermissions.includes(permission);
  }, [userPermissions, currentUser?.role]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const userDocRef = doc(db, "users", userCredential.user.uid);
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

    if (!isUserDataLoaded) {
       console.warn("AuthProvider: Attempted signup before user data was loaded.");
       toast({ title: "Procesando", description: "Espere un momento mientras se carga la información del usuario.", variant: "default"});
       return null;
    }

    if (!adminPerformingSignup) {
        toast({ title: "Error de Permisos", description: "Solo un administrador autenticado puede crear nuevos usuarios.", variant: "destructive"});
        return null;
    }
    let newFirebaseUser: FirebaseUser | null = null;
    let tenantId: string;

    try {
      const emailParts = email.split('@');
      if (emailParts.length !== 2) {
        throw new Error("Formato de correo electrónico inválido.");
      }
      const domain = emailParts[1];

      const tenantsCollectionRef = collection(db, "tenants");
      const q = query(tenantsCollectionRef, where("domain", "==", domain));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        tenantId = querySnapshot.docs[0].id;
        console.log(`AuthProvider: Found existing tenant for domain ${domain} with ID: ${tenantId}`);
      } else {
        const newTenantRef = doc(tenantsCollectionRef);
        tenantId = newTenantRef.id;
        await setDoc(newTenantRef, {
          domain: domain,
          createdAt: serverTimestamp(),
        });
        console.log(`AuthProvider: Created new tenant for domain ${domain} with ID: ${tenantId}`);
      }

      // SEGUNDA CORRECCIÓN: Verificar que adminPerformingSignup.tenantId existe
      if (!adminPerformingSignup.tenantId) {
          console.error(`AuthProvider: El usuario administrador ${adminPerformingSignup.id} (email: ${adminPerformingSignup.email}) no tiene un tenantId asignado en su perfil.`);
          toast({
              title: "Error de Configuración del Administrador",
              description: "La cuenta del administrador actual no tiene un ID de tenant asociado. Verifica los datos del administrador en Firestore o contacta a soporte.",
              variant: "destructive",
          });
          return null;
      }

      const adminTenantDocRef = doc(tenantsCollectionRef, adminPerformingSignup.tenantId);
      const adminTenantDocSnap = await getDoc(adminTenantDocRef);

      if (!adminTenantDocSnap.exists()) {
          console.error(`AuthProvider: No se encontró el documento de tenant del administrador para el ID ${adminPerformingSignup.tenantId}.`);
           toast({
            title: "Error de Configuración",
            description: `No se encontró la configuración del tenant para el administrador (Tenant ID: ${adminPerformingSignup.tenantId}). Contacta a soporte.`,
            variant: "destructive",
          });
         return null;
      }

      if (adminTenantDocSnap.data()?.domain !== domain) { // Removida la condición !adminTenantDocSnap.exists() porque ya se verificó arriba
        console.warn(`AuthProvider: Admin's tenant domain (${adminTenantDocSnap.data()?.domain || 'N/A'}) does not match new user's domain (${domain}).`);
        toast({
          title: "Error de Dominio",
          description: "No tienes permiso para agregar usuarios a este dominio.",
          variant: "destructive",
        });
        return null; 
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      newFirebaseUser = userCredential.user;

      const userDocRef = doc(db, "users", newFirebaseUser.uid);
      const role = roleParam || DEFAULT_USER_ROLE;
      const newUserFirestoreData = {
        email: newFirebaseUser.email,
        name: name,
        role: role,
        createdAt: serverTimestamp(),
        avatarUrl: `https://avatar.vercel.sh/${newFirebaseUser.email}.png`,
        tenantId: tenantId 
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
      
      return newFirebaseUser;
    } catch (error: any) {
      console.error("Error en signup (admin):", error);
      let errorMessage = "Ocurrió un error al crear el usuario.";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "Este correo electrónico ya está en uso.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "La contraseña es demasiado débil. Debe tener al menos 6 caracteres.";
      } else if (error.message && error.message.includes("cannot be called with an empty path")) { // Específico para el error de path vacío
        errorMessage = "Error interno: El ID del tenant del administrador parece estar vacío. Contacta a soporte.";
      }
      toast({
        title: "Error al Crear Usuario",
        description: errorMessage,
        variant: "destructive",
      });
      window.dispatchEvent(new Event('authChanged')); 
      return null; // Siempre devolver null en caso de error en signup
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
        hasPermission,
        isUserDataLoaded, 
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
