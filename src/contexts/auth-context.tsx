
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

import {

  onAuthStateChanged,

  User as FirebaseUser,

  signInWithEmailAndPassword,

  createUserWithEmailAndPassword,

  updateProfile,

  signOut as firebaseSignOut,

} from 'firebase/auth';

import { doc, getDoc, setDoc, collection, getDocs, query, where, DocumentData } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase'; // Asegúrate que db (Firestore instance) esté exportado

import { useToast } from '@/hooks/use-toast'; // Asumo que tienes este hook



// Define los tipos para tus datos de usuario y licencia

export interface User extends DocumentData {

  id: string;

  email: string;

  name?: string;

  tenantId: string; // Clave para la validación. Asumimos que cada usuario pertenece a un tenant.

  // tenantIds?: string[]; // Alternativa si un usuario puede pertenecer a múltiples tenants

  roleId: string;

  createdAt?: string;

  // ...otros campos de usuario

}



export interface Role extends DocumentData {

  id: string;

  name: string;

  permissions: string[];

}



export interface StoredLicenseInfo extends DocumentData {

  // Define los campos de tu licencia tal como están en Firestore

  // Ejemplo: type: string; expiryDate: string; maxUsers: number;

  [key: string]: any; 

}



export type EffectiveLicenseStatus = 'active' | 'expired' | 'no_license' | 'limit_reached' | 'pending';



interface AuthContextType {

  currentUser: User | null;

  firebaseUser: FirebaseUser | null;

  loading: boolean;

  isUserDataLoaded: boolean;

  userPermissions: string[];

  licenseInfo: StoredLicenseInfo | null;

  effectiveLicenseStatus: EffectiveLicenseStatus;

  userCount: number | null;

  login: (email: string, pass: string) => Promise<FirebaseUser | null>;

  signup: (

    email: string, 

    pass: string, 

    name: string, 

    role: Role, // O solo roleId si es más simple

    adminPerformingSignup?: User | null // Para validar que el admin puede registrar en este tenant

  ) => Promise<FirebaseUser | null>;

  logout: () => Promise<void>;

  hasPermission: (permission: string) => boolean;

  // ... podrías añadir más funciones como updateUser, etc.

  unreadInboxCount: number | null;

  isLoadingUnreadCount: boolean;

  getAllUsers?: () => Promise<User[]>; // Ejemplo, si necesitas esta función

}



const AuthContext = createContext<AuthContextType | undefined>(undefined);



// Helper para obtener el tenant ID del hostname del cliente

// Necesitarás una variable de entorno para tu dominio base en el cliente.

// En .env.local: NEXT_PUBLIC_BASE_HOSTNAME=localhost

// En Vercel (producción): NEXT_PUBLIC_BASE_HOSTNAME=tudominio.com

const getTenantIdFromClientHostname = (): string | null => {

  if (typeof window === 'undefined') {

    return null;

  }

  const hostname = window.location.hostname; // ej. "clavecrm.localhost" o "localhost"

  const parts = hostname.split('.');

  const baseHostname = process.env.NEXT_PUBLIC_BASE_HOSTNAME || "localhost";

  const baseHostnamePartsCount = baseHostname.split('.').length;



  // Si el hostname tiene más partes que el baseHostname (sugiriendo un subdominio)

  // y la primera parte no es 'www'

  if (parts.length > baseHostnamePartsCount && parts[0].toLowerCase() !== 'www') {

    // Verifica que el resto del hostname coincida con el baseHostname

    // ej. hostname="clavecrm.localhost", parts=["clavecrm", "localhost"], baseHostname="localhost"

    //     parts.slice(1).join('.') === "localhost"

    // ej. hostname="tenant.midominio.com", parts=["tenant", "midominio", "com"], baseHostname="midominio.com"

    //     parts.slice(1).join('.') === "midominio.com"

    if (parts.slice(parts.length - baseHostnamePartsCount).join('.') === baseHostname) {

        return parts[0]; // Retorna la parte del subdominio como tenantId

    }

  }

  return null; // Dominio base, 'www', o no se pudo determinar el tenantId

};



export const AuthProvider = ({ children }: { children: React.ReactNode }) => {

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  const [loading, setLoading] = useState(true);

  const { toast } = useToast();

  const [isUserDataLoaded, setIsUserDataLoaded] = useState(false);

  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  const [licenseInfo, setLicenseInfo] = useState<StoredLicenseInfo | null>(null);

  const [effectiveLicenseStatus, setEffectiveLicenseStatus] = useState<EffectiveLicenseStatus>('pending');

  const [userCount, setUserCount] = useState<number | null>(null);

  const [unreadInboxCount, setUnreadInboxCount] = useState<number | null>(0);

  const [isLoadingUnreadCount, setIsLoadingUnreadCount] = useState(true);



  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {

      setFirebaseUser(fbUser);

      // Limpiar estado mientras se valida y cargan nuevos datos

      setCurrentUser(null);

      setUserPermissions([]);

      setLicenseInfo(null);

      setEffectiveLicenseStatus('pending');

      setUserCount(null);

      setIsUserDataLoaded(false); // Marcar que los datos del usuario aún no están cargados/validados

      // No resetear isLoadingUnreadCount aquí, se maneja en su propio efecto o lógica



      if (fbUser) {

        const currentClientTenantId = getTenantIdFromClientHostname();



        if (!currentClientTenantId) {

          console.warn("AuthProvider: Acceso o intento de operación en el dominio base. No permitido.");

          toast({

            title: "Acceso Denegado",

            description: "El inicio de sesión y las operaciones solo están permitidos a través de un subdominio de tenant (ej. sunombre.tudominio.com).",

            variant: "destructive",

          });

          // No se establece currentUser. Se considera como no logueado para el dominio base.

          // Si se quisiera forzar el cierre de sesión global de Firebase:

          // await firebaseSignOut(auth);

          // setFirebaseUser(null); // se actualizaría en la próxima llamada de onAuthStateChanged

          setLoading(false);

          setIsUserDataLoaded(true); // Indicar que el proceso de "carga" (de no usuario) ha terminado

          return;

        }



        // Si estamos en un subdominio de tenant, proceder a obtener datos del usuario

        const userDocRef = doc(db, "users", fbUser.uid);

        const userDocSnap = await getDoc(userDocRef);



        if (userDocSnap.exists()) {

          const userData = userDocSnap.data() as User;



          // VALIDACIÓN DE PERTENENCIA AL TENANT DEL SUBDOMINIO

          const userBelongsToThisClientTenant = userData.tenantId === currentClientTenantId;

          // Si usaras `tenantIds` (array) en lugar de `tenantId` (string):

          // const userBelongsToThisClientTenant = Array.isArray(userData.tenantIds) && userData.tenantIds.includes(currentClientTenantId);



          if (!userBelongsToThisClientTenant) {

            console.warn(`AuthProvider: Usuario ${fbUser.uid} (registrado en tenant: ${userData.tenantId}) intentando acceder al tenant del subdominio '${currentClientTenantId}' sin autorización.`);

            toast({

              title: "Acceso Denegado al Tenant",

              description: `No tienes permiso para acceder al tenant '${currentClientTenantId}'. Serás desconectado si es necesario o no podrás operar.`,

              variant: "destructive",

            });

            // No se establece currentUser. El usuario no puede operar en este tenant.

            // Considera si quieres forzar un signOut aquí para limpiar el estado de Firebase:

            // await firebaseSignOut(auth);

            setLoading(false);

            setIsUserDataLoaded(true);

            return;

          }



          // Si el usuario pertenece al tenant, continuar normalmente

          setCurrentUser({ ...userData, id: fbUser.uid });

          setIsUserDataLoaded(true);



          // Cargar permisos basados en el rol del usuario

          if (userData.roleId) {

            // Asumiendo que los roles son globales. Si son por tenant, la ruta cambiaría:

            // const roleDocRef = doc(db, `tenants/${currentClientTenantId}/roles`, userData.roleId);

            const roleDocRef = doc(db, "roles", userData.roleId);

            const roleDocSnap = await getDoc(roleDocRef);

            if (roleDocSnap.exists()) {

              setUserPermissions(roleDocSnap.data()?.permissions || []);

            } else {

              console.warn(`AuthProvider: Rol con ID ${userData.roleId} no encontrado para el usuario ${fbUser.uid}.`);

              setUserPermissions([]); // Sin permisos si el rol no se encuentra

            }

          } else {

            setUserPermissions([]);

          }



          // Cargar información de licencia y conteo de usuarios PARA EL TENANT ACTUAL

          // Asumimos que la licencia está en `tenants/{tenantId}/license/info`

          const tenantLicenseDocRef = doc(db, `tenants/${currentClientTenantId}/license/info`);

          const licenseSnap = await getDoc(tenantLicenseDocRef);

          if (licenseSnap.exists()) {

            setLicenseInfo(licenseSnap.data() as StoredLicenseInfo);

            // Aquí deberías recalcular effectiveLicenseStatus basado en la nueva licenseInfo y userCount

          } else {

            setLicenseInfo(null);

            setEffectiveLicenseStatus('no_license');

          }

          

          // Lógica para contar usuarios del tenant actual

          const usersInTenantQuery = query(collection(db, "users"), where("tenantId", "==", currentClientTenantId));

          const usersInTenantSnap = await getDocs(usersInTenantQuery);

          setUserCount(usersInTenantSnap.size);

          // Recalcular effectiveLicenseStatus después de tener userCount y licenseInfo

          // (Esta lógica de effectiveLicenseStatus debe ser robusta y considerar todos los estados)



        } else {

          console.error(`AuthProvider: No se encontró el documento de usuario en Firestore para UID: ${fbUser.uid}. El usuario no puede iniciar sesión completamente.`);

          toast({

            title: "Error de Perfil de Usuario",

            description: "No se encontró tu perfil de usuario en la base de datos. Contacta a soporte.",

            variant: "destructive",

          });

          // await firebaseSignOut(auth); // Forzar cierre de sesión si el perfil no existe es una opción

        }

      } else { // No fbUser (usuario cerró sesión o no está logueado)

        setCurrentUser(null);

        setUserPermissions([]);

        setLicenseInfo(null);

        setEffectiveLicenseStatus('no_license'); 

        setUserCount(null);

        setIsUserDataLoaded(true); // Importante para indicar que la carga (de no usuario) terminó

      }

      setLoading(false);

    });



    return () => unsubscribe();

  // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [toast]); // `toast` es una dependencia. Si usas otras funciones de AuthProvider aquí, añádelas.



  const login = async (email: string, pass: string): Promise<FirebaseUser | null> => {

    setLoading(true);

    const currentClientTenantId = getTenantIdFromClientHostname();

    if (!currentClientTenantId) {

      toast({

        title: "Inicio de Sesión No Permitido",

        description: "Solo puedes iniciar sesión desde una URL de tenant (ej. sunombre.tudominio.com).",

        variant: "destructive",

      });

      setLoading(false);

      return null;

    }

    try {

      const userCredential = await signInWithEmailAndPassword(auth, email, pass);

      // onAuthStateChanged se encargará de cargar los datos del usuario y las validaciones de tenant.

      return userCredential.user;

    } catch (error: any) {

      console.error("Error en login:", error);

      toast({ title: "Error de Inicio de Sesión", description: error.message, variant: "destructive" });

      setLoading(false);

      return null;

    }

  };



  const signup = async (

    email: string, 

    pass: string, 

    name: string, 

    role: Role, // Asumimos que se pasa el objeto Role o al menos role.id

    adminPerformingSignup?: User | null

  ): Promise<FirebaseUser | null> => {

    setLoading(true);

    const currentClientTenantId = getTenantIdFromClientHostname();

    if (!currentClientTenantId) {

      toast({

        title: "Registro No Permitido",

        description: "El registro de nuevas cuentas solo está permitido desde una URL de tenant (ej. sunombre.tudominio.com).",

        variant: "destructive",

      });

      setLoading(false);

      return null;

    }



    // Opcional: Validación si un admin está creando la cuenta

    if (adminPerformingSignup) {

      if (!adminPerformingSignup.tenantId || adminPerformingSignup.tenantId !== currentClientTenantId) {

        toast({ title: "Acción No Permitida", description: "No puedes registrar usuarios para un tenant diferente al tuyo o desde esta URL.", variant: "destructive" });

        setLoading(false);

        return null;

      }

    }



    try {

      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);

      const newUser = userCredential.user;

      await updateProfile(newUser, { displayName: name });



      const userDocRef = doc(db, "users", newUser.uid);

      const newUserFirestoreData: User = {

        id: newUser.uid,

        email: newUser.email!,

        name: name,

        tenantId: currentClientTenantId, // ASIGNAR EL TENANT ID DEL SUBDOMINIO ACTUAL

        roleId: role.id, // Asignar el ID del rol

        createdAt: new Date().toISOString(),

      };

      await setDoc(userDocRef, newUserFirestoreData);

      

      // onAuthStateChanged se encargará de establecer currentUser y otras validaciones.

      toast({ title: "Usuario Registrado", description: "El nuevo usuario ha sido registrado exitosamente."});

      // setLoading(false) será manejado por el onAuthStateChanged final

      return newUser;

    } catch (error: any) {

      console.error("Error en signup:", error);

      let errorMessage = "Ocurrió un error durante el registro.";

      if (error.code === 'auth/email-already-in-use') {

        errorMessage = "Esta dirección de correo electrónico ya está en uso.";

      } else if (error.code === 'auth/weak-password') {

        errorMessage = "La contraseña es demasiado débil. Debe tener al menos 6 caracteres.";

      }

      toast({ title: "Error de Registro", description: errorMessage, variant: "destructive" });

      setLoading(false);

      return null;

    }

  };



  const logout = async () => {

    await firebaseSignOut(auth);

    // onAuthStateChanged limpiará el estado (currentUser, etc.)

  };



  const hasPermission = useCallback((permission: string): boolean => {

    return userPermissions.includes(permission);

  }, [userPermissions]);



  // Lógica para actualizar effectiveLicenseStatus (ejemplo simplificado)

  useEffect(() => {

    if (!licenseInfo) {

      setEffectiveLicenseStatus('no_license');

      return;

    }

    // Aquí iría tu lógica para determinar el estado de la licencia

    // basado en licenseInfo.type, licenseInfo.expiryDate, userCount, licenseInfo.maxUsers, etc.

    // Esto es un placeholder:

    setEffectiveLicenseStatus('active'); // Reemplaza con tu lógica real

  }, [licenseInfo, userCount]);



  return (

    <AuthContext.Provider value={{

      currentUser,

      firebaseUser,

      loading,

      isUserDataLoaded,

      userPermissions,

      licenseInfo,

      effectiveLicenseStatus,

      userCount,

      login,

      signup,

      logout,

      hasPermission,

      unreadInboxCount, // Asegúrate que esto se actualiza desde algún sitio (ej. listener de Firestore)

      isLoadingUnreadCount // Y su estado de carga

    }}>

      {children}

    </AuthContext.Provider>

  );

};



export const useAuth = (): AuthContextType => {

  const context = useContext(AuthContext);

  if (context === undefined) {

    throw new Error('useAuth debe ser usado dentro de un AuthProvider');

  }

  return context;

};



// Hook opcional si a veces necesitas acceder al contexto sin error si no está disponible

export const useAuthUnsafe = (): AuthContextType | undefined => {

  return useContext(AuthContext);

};



