
// src/contexts/auth-context.tsx
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


  React.useEffect(() => {
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

      let currentLicenseInfo: StoredLicenseInfo | null = null;
      let allUsers: User[] = [];
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
            if (!validationResponse.isValid) {
              newEffectiveStatus = 'invalid_key';
            } else if (validationResponse.productId !== currentAppProjectId) { // Use currentAppProjectId
              newEffectiveStatus = 'mismatched_project_id';
            } else if (validationResponse.expiresAt && new Date(validationResponse.expiresAt) < new Date()) {
              newEffectiveStatus = 'expired';
            } else {
              try {
                const usersCollectionRef = collection(db, "users");
                const querySnapshot = await getDocs(usersCollectionRef);
                allUsers = querySnapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data() } as User));
                setUserCount(allUsers.length);

                if (validationResponse.maxUsers !== null && typeof validationResponse.maxUsers === 'number' && allUsers.length > validationResponse.maxUsers) {
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
    
    const handleAuthChange = () => {
        onAuthStateChanged(auth, user => {
            // This will re-trigger the main logic of the useEffect
        });
    };
    window.addEventListener('authChanged', handleAuthChange);


    return () => {
      unsubscribe();
      window.removeEventListener('authChanged', handleAuthChange);
    }
  }, [adminUserForSignup]); 

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = { id: userCredential.user.uid, ...userDocSnap.data() } as User;
        await logSystemEvent(userData, 'login', 'User', userCredential.user.uid, `Usuario ${email} inició sesión.`);
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

  const signup = async (email: string, pass: string, name: string, role?: UserRole): Promise<FirebaseUser | null> => {
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
      const newUserFirestoreData = {
        uid: newFirebaseUser.uid,
        email: newFirebaseUser.email,
        name: name,
        role: role || DEFAULT_USER_ROLE,
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
      await logSystemEvent(adminPerformingSignup, 'create', 'User', newFirebaseUser.uid, `Usuario ${name} (${email}) creado con rol ${role || DEFAULT_USER_ROLE}.`);
      
      if (auth.currentUser && auth.currentUser.uid === newFirebaseUser.uid) {
        await signOut(auth);
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
      setAdminUserForSignup(null); 
      if (auth.currentUser?.uid !== adminPerformingSignup.id) {
          console.warn("Admin session might have been lost during failed signup. Admin may need to re-login if issues persist.");
      }
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

  const getAllUsers = async (): Promise<User[]> => {
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
