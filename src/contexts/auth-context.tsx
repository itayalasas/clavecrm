
"use client";

import type { User as FirebaseUser, UserCredential } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db } from "@/lib/firebase";
import { 
  onAuthStateChanged, 
  signOut as firebaseSignOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import type { User, UserRole } from "@/lib/types"; 
import { DEFAULT_USER_ROLE } from "@/lib/constants";

interface AuthContextType {
  currentUser: User | null; 
  firebaseUser: FirebaseUser | null; 
  loading: boolean;
  error: Error | null;
  login: (email: string, pass: string) => Promise<UserCredential>;
  signup: (email: string, pass: string, name?: string, role?: UserRole) => Promise<UserCredential>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          // Ensure role is correctly typed, default if necessary
          const userData = userDocSnap.data();
          setCurrentUser({ 
            id: user.uid, 
            ...userData,
            role: userData.role || DEFAULT_USER_ROLE // Default role if not set
          } as User);
        } else {
           const newUser: User = {
            id: user.uid,
            email: user.email || "",
            name: user.displayName || user.email?.split('@')[0] || "Usuario Anónimo",
            role: DEFAULT_USER_ROLE, 
          };
          await setDoc(userDocRef, { 
            email: newUser.email, 
            name: newUser.name,
            role: newUser.role 
          });
          setCurrentUser(newUser);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    }, (err) => {
      setError(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = (email: string, pass: string) => {
    setLoading(true);
    setError(null); // Clear previous errors
    return signInWithEmailAndPassword(auth, email, pass)
      .catch(err => { setError(err); setLoading(false); throw err; });
  };

  const signup = async (email: string, pass: string, name?: string, role?: UserRole) => {
    setLoading(true);
    setError(null); // Clear previous errors
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;
      
      const userRole = role || DEFAULT_USER_ROLE;
      const newUserProfile: Omit<User, 'id' | 'avatarUrl'> = { 
        email: user.email || "",
        name: name || user.displayName || user.email?.split('@')[0] || "Nuevo Usuario",
        role: userRole,
      };

      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, newUserProfile);
      
      // Send verification and password reset emails
      // It's important that the user object from createUserWithEmailAndPassword is used for sendEmailVerification
      if (user) {
        await sendEmailVerification(user);
        // sendPasswordResetEmail can be called with the auth instance and email
        await sendPasswordResetEmail(auth, email);
      }
      
      // The new user is now signed in. currentUser will be updated by onAuthStateChanged.
      // For immediate reflection if needed, you could call:
      // setCurrentUser({id: user.uid, ...newUserProfile});
      // However, onAuthStateChanged should handle this robustly.

      setLoading(false);
      return userCredential;
    } catch (err: any) {
      setError(err);
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    return firebaseSignOut(auth);
  };

  const value = {
    currentUser,
    firebaseUser,
    loading,
    error,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
