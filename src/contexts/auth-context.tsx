
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
import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

export interface User extends DocumentData {
  id: string;
  email: string;
  name?: string;
  tenantId: string; // Este es el ID del DOCUMENTO del tenant en la colección 'tenants'
  roleId: string;
  createdAt?: string;
}

export interface Role extends DocumentData {
  id: string;
  name: string;
  permissions: string[];
}

export interface StoredLicenseInfo extends DocumentData {
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
    role: Role,
    adminPerformingSignup?: User | null
  ) => Promise<FirebaseUser | null>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  unreadInboxCount: number | null;
  isLoadingUnreadCount: boolean;
  getAllUsers?: () => Promise<User[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Función para obtener el slug del subdominio (ej. "clavecrm")
const getSubdomainSlugFromClientHostname = (): string | null => {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  const baseHostname = process.env.NEXT_PUBLIC_BASE_HOSTNAME || "localhost";
  const baseHostnamePartsCount = baseHostname.split('.').length;
  if (parts.length > baseHostnamePartsCount && parts[0].toLowerCase() !== 'www') {
    if (parts.slice(parts.length - baseHostnamePartsCount).join('.') === baseHostname) {
      return parts[0]; 
    }
  }
  return null;
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
      setCurrentUser(null);
      setUserPermissions([]);
      setLicenseInfo(null);
      setEffectiveLicenseStatus('pending');
      setUserCount(null);
      setIsUserDataLoaded(false);

      if (fbUser) {
        const subdomainSlug = getSubdomainSlugFromClientHostname();

        if (!subdomainSlug) {
          console.warn("AuthProvider: Acceso o intento de operación en el dominio base. No permitido.");
          toast({ title: "Acceso Denegado", description: "El inicio de sesión y las operaciones solo están permitidos a través de un subdominio de tenant.", variant: "destructive" });
          setLoading(false); setIsUserDataLoaded(true); return;
        }

        let actualTenantDocId: string | null = null;
        try {
          // Buscar el tenant en Firestore cuyo campo 'domain' COMIENCE con el slug del subdominio.
          // Ejemplo: subdomainSlug = "clavecrm", buscar documentos donde 'domain' sea "clavecrm.com" o "clavecrm.otrodominio.es"
          const tenantsRef = collection(db, "tenants");
          const q = query(tenantsRef, where("domain", ">=", subdomainSlug + "."), where("domain", "<=", subdomainSlug + ".\uf8ff"));
          const tenantSnapshots = await getDocs(q);

          if (!tenantSnapshots.empty) {
            let foundTenant = false;
            tenantSnapshots.forEach(docSnapshot => {
              // Verificación adicional para asegurar que el inicio del campo 'domain' realmente coincide con el slug
              if (docSnapshot.data().domain && docSnapshot.data().domain.startsWith(subdomainSlug + '.')) {
                actualTenantDocId = docSnapshot.id;
                console.log(`AuthProvider: Subdominio '${subdomainSlug}' corresponde al Tenant Document ID: '${actualTenantDocId}' (Domain: ${docSnapshot.data().domain})`);
                foundTenant = true;
                // Si esperas múltiples coincidencias (no debería ser el caso para un slug único), toma la primera.
                return; // Salir del forEach una vez encontrado
              }
            });
            if (!foundTenant) {
                 console.warn(`AuthProvider: Se encontraron tenants con el query de rango para '${subdomainSlug}', pero ninguno coincidió exactamente con .startsWith('${subdomainSlug}.')`);
            }
          } else {
            console.warn(`AuthProvider: No se encontró ningún tenant en Firestore para el subdominio slug '${subdomainSlug}'.`);
          }
        } catch (error) {
          console.error("AuthProvider: Error al buscar el tenant por subdominio:", error);
          toast({ title: "Error Interno", description: "No se pudo verificar la información del tenant.", variant: "destructive" });
          setLoading(false); setIsUserDataLoaded(true); return;
        }

        if (!actualTenantDocId) {
          console.warn(`AuthProvider: No se pudo resolver el ID del documento para el tenant del subdominio '${subdomainSlug}'.`);
          toast({ title: "Tenant No Encontrado", description: `El tenant '${subdomainSlug}' no está configurado correctamente o no se encontró.`, variant: "destructive" });
          setLoading(false); setIsUserDataLoaded(true); return;
        }

        const userDocRef = doc(db, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as User;

          // ESTA ES LA COMPARACIÓN CRÍTICA:
          if (userData.tenantId !== actualTenantDocId) { 
            console.warn(`AuthProvider: Usuario ${fbUser.uid} (registrado en tenant Doc ID: ${userData.tenantId}) intentando acceder al subdominio '${subdomainSlug}' (que corresponde al Tenant Doc ID: '${actualTenantDocId}') sin autorización.`);
            toast({ title: "Acceso Denegado al Tenant", description: `No tienes permiso para acceder al tenant '${subdomainSlug}'.`, variant: "destructive" });
            setLoading(false); setIsUserDataLoaded(true); return;
          }

          // Si la validación es exitosa, proceder a cargar el usuario y sus datos.
          setCurrentUser({ ...userData, id: fbUser.uid });
          setIsUserDataLoaded(true);

          if (userData.roleId) {
            const roleDocRef = doc(db, "roles", userData.roleId);
            const roleDocSnap = await getDoc(roleDocRef);
            if (roleDocSnap.exists()) setUserPermissions(roleDocSnap.data()?.permissions || []);
            else {
              console.warn(`AuthProvider: Rol con ID ${userData.roleId} no encontrado.`);
              setUserPermissions([]);
            }
          } else setUserPermissions([]);

          const tenantLicenseDocRef = doc(db, `tenants/${actualTenantDocId}/license/info`);
          const licenseSnap = await getDoc(tenantLicenseDocRef);
          if (licenseSnap.exists()) setLicenseInfo(licenseSnap.data() as StoredLicenseInfo);
          else {
            setLicenseInfo(null);
            setEffectiveLicenseStatus('no_license');
          }
          
          const usersInTenantQuery = query(collection(db, "users"), where("tenantId", "==", actualTenantDocId));
          const usersInTenantSnap = await getDocs(usersInTenantQuery);
          setUserCount(usersInTenantSnap.size);

        } else {
          console.error(`AuthProvider: No se encontró el documento de usuario en Firestore para UID: ${fbUser.uid}.`);
          toast({ title: "Error de Perfil", description: "Tu perfil de usuario no fue encontrado.", variant: "destructive" });
        }
      } else {
        setCurrentUser(null); setUserPermissions([]); setLicenseInfo(null);
        setEffectiveLicenseStatus('no_license'); setUserCount(null); setIsUserDataLoaded(true);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const login = async (email: string, pass: string): Promise<FirebaseUser | null> => {
    setLoading(true);
    const subdomainSlug = getSubdomainSlugFromClientHostname();
    if (!subdomainSlug) {
      toast({ title: "Inicio de Sesión No Permitido", description: "Solo puedes iniciar sesión desde una URL de tenant.", variant: "destructive" });
      setLoading(false); return null;
    }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      return userCredential.user; // onAuthStateChanged manejará la validación de tenant
    } catch (error: any) {
      console.error("Error en login:", error);
      toast({ title: "Error de Inicio de Sesión", description: error.message, variant: "destructive" });
      setLoading(false); return null;
    }
  };

  const signup = async (
    email: string, pass: string, name: string, role: Role, adminPerformingSignup?: User | null
  ): Promise<FirebaseUser | null> => {
    setLoading(true);
    const subdomainSlug = getSubdomainSlugFromClientHostname();
    if (!subdomainSlug) {
      toast({ title: "Registro No Permitido", description: "El registro solo es permitido desde una URL de tenant.", variant: "destructive" });
      setLoading(false); return null;
    }

    let actualTenantDocIdForNewUser: string | null = null;
    try {
        const tenantsRef = collection(db, "tenants");
        const q = query(tenantsRef, where("domain", ">=", subdomainSlug + "."), where("domain", "<=", subdomainSlug + ".\uf8ff"));
        const tenantSnapshots = await getDocs(q);
        if (!tenantSnapshots.empty) {
            tenantSnapshots.forEach(docSnapshot => {
                 if (docSnapshot.data().domain && docSnapshot.data().domain.startsWith(subdomainSlug + '.')) {
                    actualTenantDocIdForNewUser = docSnapshot.id;
                    return;
                 }
            });
        }
    } catch (error) {
        console.error("AuthProvider (signup): Error buscando ID de tenant:", error);
        toast({ title: "Error Interno", description: "No se pudo verificar la información del tenant para el registro.", variant: "destructive" });
        setLoading(false); return null;
    }

    if (!actualTenantDocIdForNewUser) {
        toast({ title: "Tenant No Configurado", description: `El tenant '${subdomainSlug}' no está configurado para permitir registros o no se encontró.`, variant: "destructive" });
        setLoading(false); return null;
    }

    if (adminPerformingSignup) {
      if (!adminPerformingSignup.tenantId || adminPerformingSignup.tenantId !== actualTenantDocIdForNewUser) {
        toast({ title: "Acción No Permitida", description: "No puedes registrar usuarios para este tenant.", variant: "destructive" });
        setLoading(false); return null;
      }
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser = userCredential.user;
      await updateProfile(newUser, { displayName: name });
      const userDocRef = doc(db, "users", newUser.uid);
      const newUserFirestoreData: User = {
        id: newUser.uid, email: newUser.email!, name: name,
        tenantId: actualTenantDocIdForNewUser, // ASIGNAR EL ID DEL DOCUMENTO DEL TENANT CORRECTO
        roleId: role.id, createdAt: new Date().toISOString(),
      };
      await setDoc(userDocRef, newUserFirestoreData);
      toast({ title: "Usuario Registrado", description: "El nuevo usuario ha sido registrado exitosamente."});
      return newUser; // onAuthStateChanged manejará la carga final y validación
    } catch (error: any) {
      console.error("Error en signup:", error);
      let em = "Ocurrió un error.";
      if (error.code === 'auth/email-already-in-use') em = "Correo ya en uso.";
      else if (error.code === 'auth/weak-password') em = "Contraseña débil.";
      toast({ title: "Error de Registro", description: em, variant: "destructive" });
      setLoading(false); return null;
    }
  };

  const logout = async () => { await firebaseSignOut(auth); };

  const hasPermission = useCallback((p: string): boolean => userPermissions.includes(p), [userPermissions]);

  useEffect(() => { // Lógica de licencia
    if (!licenseInfo) { setEffectiveLicenseStatus('no_license'); return; }
    setEffectiveLicenseStatus('active'); // Placeholder, implementa tu lógica real aquí
  }, [licenseInfo, userCount]);

  return (
    <AuthContext.Provider value={{
      currentUser, firebaseUser, loading, isUserDataLoaded, userPermissions, licenseInfo,
      effectiveLicenseStatus, userCount, login, signup, logout, hasPermission,
      unreadInboxCount, isLoadingUnreadCount
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth debe usarse dentro de un AuthProvider');
  return context;
};

export const useAuthUnsafe = (): AuthContextType | undefined => useContext(AuthContext);
