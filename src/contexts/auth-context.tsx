
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
import { doc, getDoc, setDoc, collection, getDocs, query, where, DocumentData, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

export interface User extends DocumentData {
  id: string;
  email: string;
  name?: string;
  tenantId: string; // ID del documento del tenant
  roleId: string;
  createdAt?: string;
}

export interface Role extends DocumentData {
  id: string;
  name: string;
  permissions: string[];
}

export interface StoredLicenseInfo extends DocumentData {
  status: 'active' | 'expired' | 'trial' | 'cancelled' | 'not_configured' | string;
  expiryDate?: Timestamp | string;
  maxUsersAllowed?: number;
  type?: string;
  licenseKey?: string;
}

export type EffectiveLicenseStatus = 'active' | 'expired' | 'no_license' | 'limit_reached' | 'pending' | 'not_configured' | 'cancelled';

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
  signup: (email: string, pass: string, name: string, role: Role, adminPerformingSignup?: User | null) => Promise<FirebaseUser | null>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  unreadInboxCount: number | null;
  isLoadingUnreadCount: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Función para extraer solo el hostname de una URL (si se proporciona)
const getHostnameFromString = (urlOrHostname: string | undefined): string => {
  if (!urlOrHostname) return "localhost"; // Default si no hay nada
  try {
    // Si es una URL completa (http://localhost:3000), extraer el hostname
    if (urlOrHostname.includes(':/')) {
      const url = new URL(urlOrHostname);
      return url.hostname; // Devuelve 'localhost' o 'midominio.com'
    }
    // Si ya es solo un hostname (posiblemente con puerto), quitar el puerto si existe
    return urlOrHostname.split(':')[0];
  } catch (e) {
    // Si no se puede parsear como URL, asumir que es un hostname (quizás con puerto)
    return urlOrHostname.split(':')[0];
  }
};

const getSubdomainSlugFromClientHostname = (): string | null => {
  if (typeof window === 'undefined') return null;
  
  const currentClientHostname = window.location.hostname; // ej. "clavecrm.localhost"
  // Usar NEXT_PUBLIC_BASE_URL y extraer el hostname de él.
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const baseHostname = getHostnameFromString(configuredBaseUrl); // ej. "localhost" o "midominio.com"

  console.log("AUTH_CONTEXT: getSubdomainSlug - currentClientHostname:", currentClientHostname);
  console.log("AUTH_CONTEXT: getSubdomainSlug - configuredBaseUrl (NEXT_PUBLIC_BASE_URL):", configuredBaseUrl);
  console.log("AUTH_CONTEXT: getSubdomainSlug - parsed baseHostname:", baseHostname);

  const clientParts = currentClientHostname.split('.');
  const basePartsCount = baseHostname.split('.').length;

  if (clientParts.length > basePartsCount && clientParts[0].toLowerCase() !== 'www') {
    // Compara la parte final del clientHostname con el baseHostname
    // ej. client: "clavecrm.localhost", base: "localhost" -> client.slice(1).join('.') === "localhost"
    // ej. client: "tenant.midominio.com", base: "midominio.com" -> client.slice(1).join('.') === "midominio.com"
    if (clientParts.slice(clientParts.length - basePartsCount).join('.') === baseHostname) {
      console.log("AUTH_CONTEXT: getSubdomainSlug - Detected slug:", clientParts[0]);
      return clientParts[0];
    }
  }
  console.log("AUTH_CONTEXT: getSubdomainSlug - No slug detected or base domain access.");
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
    console.log("AUTH_CONTEXT: License Status Effect - Recalculando. Dependencies: loading:", loading, "isUserDataLoaded:", isUserDataLoaded, "currentUser:", !!currentUser, "licenseInfo:", licenseInfo, "userCount:", userCount);
    if (loading || !isUserDataLoaded) { console.log("AUTH_CONTEXT: License Status Effect -> PENDING (carga inicial)"); setEffectiveLicenseStatus('pending'); return; }
    if (!currentUser) { console.log("AUTH_CONTEXT: License Status Effect -> NOT_CONFIGURED (no currentUser)"); setEffectiveLicenseStatus('not_configured'); return; }
    if (!licenseInfo) { console.log("AUTH_CONTEXT: License Status Effect -> NO_LICENSE (doc de licencia no encontrado)"); setEffectiveLicenseStatus('no_license'); return; }
    if (licenseInfo.status === 'not_configured' || !licenseInfo.status) { console.log("AUTH_CONTEXT: License Status Effect -> NOT_CONFIGURED (explícito o ausente)"); setEffectiveLicenseStatus('not_configured'); return; }
    if (licenseInfo.expiryDate) {
      const expiry = (licenseInfo.expiryDate instanceof Timestamp) ? licenseInfo.expiryDate.toDate() : new Date(licenseInfo.expiryDate as string);
      if (expiry < new Date()) { console.log("AUTH_CONTEXT: License Status Effect -> EXPIRED (fecha)"); setEffectiveLicenseStatus('expired'); return; }
    }
    if (typeof licenseInfo.maxUsersAllowed === 'number' && typeof userCount === 'number') {
      if (licenseInfo.maxUsersAllowed > 0 && userCount > licenseInfo.maxUsersAllowed) { console.log("AUTH_CONTEXT: License Status Effect -> LIMIT_REACHED"); setEffectiveLicenseStatus('limit_reached'); return; }
    }
    if (licenseInfo.status === 'active' || licenseInfo.status === 'trial') { console.log(`AUTH_CONTEXT: License Status Effect -> ACTIVE (status: ${licenseInfo.status})`); setEffectiveLicenseStatus('active');
    } else if (licenseInfo.status === 'cancelled') { console.log("AUTH_CONTEXT: License Status Effect -> CANCELLED"); setEffectiveLicenseStatus('cancelled'); 
    } else if (licenseInfo.status === 'expired') { console.log("AUTH_CONTEXT: License Status Effect -> EXPIRED (explícito)"); setEffectiveLicenseStatus('expired');
    } else { console.warn(`AUTH_CONTEXT: License Status Effect -> NO_LICENSE (status no reconocido: ${licenseInfo.status})`); setEffectiveLicenseStatus('no_license'); }
  }, [licenseInfo, userCount, loading, isUserDataLoaded, currentUser]);

  useEffect(() => {
    console.log("AUTH_CONTEXT: onAuthStateChanged listener setup.");
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.log("AUTH_CONTEXT: onAuthStateChanged triggered. fbUser:", fbUser ? fbUser.uid : "null");
      setFirebaseUser(fbUser); setCurrentUser(null); setUserPermissions([]); setLicenseInfo(null); setUserCount(null); setIsUserDataLoaded(false); setLoading(true);

      if (fbUser) {
        const subdomainSlug = getSubdomainSlugFromClientHostname();
        console.log("AUTH_CONTEXT: onAuthStateChanged - Subdomain Slug:", subdomainSlug);
        if (!subdomainSlug) { console.warn("AUTH_CONTEXT: onAuthStateChanged - Base domain. currentUser null."); setIsUserDataLoaded(true); setLoading(false); return; }

        let actualTenantDocId: string | null = null;
        try {
          const tenantsRef = collection(db, "tenants");
          const q = query(tenantsRef, where("domain", ">=", subdomainSlug + "."), where("domain", "<=", subdomainSlug + ".\uf8ff"));
          const tenantSnapshots = await getDocs(q);
          if (!tenantSnapshots.empty) { tenantSnapshots.forEach(docSnapshot => { if (docSnapshot.data().domain?.startsWith(subdomainSlug + '.')) actualTenantDocId = docSnapshot.id; }); }
          if (actualTenantDocId) console.log(`AUTH_CONTEXT: onAuthStateChanged - Slug '${subdomainSlug}' -> TenantDocID: '${actualTenantDocId}'`);
          else console.warn(`AUTH_CONTEXT: onAuthStateChanged - No tenant found for slug '${subdomainSlug}'.`);
        } catch (e) { console.error("AUTH_CONTEXT: Error fetching tenant by slug:", e); setIsUserDataLoaded(true); setLoading(false); return; }

        if (!actualTenantDocId) { toast({ title: "Tenant No Encontrado", description: `Tenant '${subdomainSlug}' no configurado.`, variant: "destructive" }); setIsUserDataLoaded(true); setLoading(false); return; }

        const userDocRef = doc(db, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as User;
          console.log("AUTH_CONTEXT: onAuthStateChanged - User data from Firestore:", userData);
          if (userData.tenantId !== actualTenantDocId) { console.warn(`AUTH_CONTEXT: User ${fbUser.uid} (tenant ${userData.tenantId}) MISMATCH for slug ${subdomainSlug} (expected ${actualTenantDocId}).`); toast({ title: "Acceso Denegado", description: `No tienes permiso para '${subdomainSlug}'.`, variant: "destructive" }); setIsUserDataLoaded(true); setLoading(false); return; }
          console.log("AUTH_CONTEXT: onAuthStateChanged - TENANT VALIDATION SUCCESS. Setting currentUser.");
          setCurrentUser({ ...userData, id: fbUser.uid });
          if (userData.roleId) { const r = await getDoc(doc(db, "roles", userData.roleId)); if(r.exists()) setUserPermissions(r.data()?.permissions || []); else setUserPermissions([]); } else setUserPermissions([]);
          console.log("AUTH_CONTEXT: Loading license for tenant:", actualTenantDocId);
          const l = await getDoc(doc(db, `tenants/${actualTenantDocId}/license/info`));
          if (l.exists()) { console.log("AUTH_CONTEXT: License data found:", l.data()); setLicenseInfo(l.data() as StoredLicenseInfo); } 
          else { console.warn("AUTH_CONTEXT: License doc not found for tenant", actualTenantDocId); setLicenseInfo(null); }
          const u = await getDocs(query(collection(db, "users"), where("tenantId", "==", actualTenantDocId)));
          setUserCount(u.size); console.log("AUTH_CONTEXT: User count for", actualTenantDocId, ":", u.size);
        } else { console.error("AUTH_CONTEXT: User doc not found for UID:", fbUser.uid); toast({ title: "Error de Perfil", description: "Perfil no encontrado.", variant: "destructive" }); }
      } else { console.log("AUTH_CONTEXT: No fbUser. currentUser is null."); }
      setIsUserDataLoaded(true); setLoading(false);
      console.log("AUTH_CONTEXT: onAuthStateChanged - End. loading:", false, "isUserDataLoaded:", true, "currentUser:", currentUser ? currentUser.id : "null");
    });
    return () => { console.log("AUTH_CONTEXT: onAuthStateChanged cleanup."); unsubscribe(); }
  }, [toast]);

  const login = async (email: string, pass: string): Promise<FirebaseUser | null> => { setLoading(true); const slug = getSubdomainSlugFromClientHostname(); console.log("AUTH_CONTEXT: login attempt - slug:", slug); if (!slug) { toast({ title: "Login No Permitido", description: "Login solo desde URL de tenant.", variant: "destructive" }); setLoading(false); return null; } try { const uc = await signInWithEmailAndPassword(auth, email, pass); console.log("AUTH_CONTEXT: Firebase Auth login OK."); return uc.user; } catch (e: any) { toast({ title: "Error de Login", description: e.message, variant: "destructive" }); setLoading(false); return null; } };
  const signup = async (email: string, pass: string, name: string, role: Role, admin?: User | null): Promise<FirebaseUser | null> => { setLoading(true); const slug = getSubdomainSlugFromClientHostname(); console.log("AUTH_CONTEXT: signup attempt - slug:", slug); if (!slug) { toast({ title: "Registro No Permitido", variant: "destructive" }); setLoading(false); return null; } let tenantId: string | null = null; try { const q = query(collection(db, "tenants"), where("domain", ">=", slug + "."), where("domain", "<=", slug + ".\uf8ff")); const ts = await getDocs(q); if (!ts.empty) { ts.forEach(ds => { if (ds.data().domain?.startsWith(slug + '.')) tenantId = ds.id; }); } if(tenantId) console.log("AUTH_CONTEXT: signup - resolved tenantId:", tenantId); else console.warn("AUTH_CONTEXT: signup - no tenantId from slug:", slug); } catch (e) { toast({ title: "Error Interno", variant: "destructive" }); setLoading(false); return null; } if (!tenantId) { toast({ title: "Tenant No Configurado", variant: "destructive" }); setLoading(false); return null; } if (admin) { if (!admin.tenantId || admin.tenantId !== tenantId) { toast({ title: "Acción No Permitida", variant: "destructive" }); setLoading(false); return null; } } try { const uc = await createUserWithEmailAndPassword(auth, email, pass); await updateProfile(uc.user, { displayName: name }); await setDoc(doc(db, "users", uc.user.uid), { id: uc.user.uid, email: uc.user.email!, name, tenantId, roleId: role.id, createdAt: new Date().toISOString() }); toast({ title: "Usuario Registrado" }); return uc.user; } catch (e:any) { let m="Error"; if(e.code==='auth/email-already-in-use')m="Correo ya en uso."; else if(e.code==='auth/weak-password')m="Contraseña débil."; toast({ title: "Error Registro", description:m, variant:"destructive" }); setLoading(false); return null; } };
  const logout = async () => { console.log("AUTH_CONTEXT: logout."); await firebaseSignOut(auth); };
  const hasPermission = useCallback((p: string): boolean => userPermissions.includes(p), [userPermissions]);

  return (
    <AuthContext.Provider value={{ currentUser, firebaseUser, loading, isUserDataLoaded, userPermissions, licenseInfo, effectiveLicenseStatus, userCount, login, signup, logout, hasPermission, unreadInboxCount, isLoadingUnreadCount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => { const ctx = useContext(AuthContext); if (ctx === undefined) throw new Error('useAuth en AuthProvider'); return ctx; };
export const useAuthUnsafe = (): AuthContextType | undefined => useContext(AuthContext);
