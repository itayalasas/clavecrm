
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
      try {
        setFirebaseUser(user);
        if (user) {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setCurrentUser({ 
              id: user.uid, 
              ...userData,
              role: userData.role || DEFAULT_USER_ROLE
            } as User);
          } else {
            // This case implies a new user or a user whose Firestore doc is missing.
            // It's typically handled during signup, but this provides a fallback.
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
      } catch (e: any) {
        console.error("Error processing auth state change:", e);
        setError(e);
        setCurrentUser(null); // Ensure user is cleared on error
      } finally {
        setLoading(false); // Ensure loading is always set to false
      }
    }, (authError) => { // Error callback for onAuthStateChanged listener itself
      console.error("Firebase onAuthStateChanged error:", authError);
      setError(authError);
      setCurrentUser(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = (email: string, pass: string) => {
    setLoading(true);
    setError(null); 
    return signInWithEmailAndPassword(auth, email, pass)
      .catch(err => { setError(err); setLoading(false); throw err; });
  };

  const signup = async (email: string, pass: string, name?: string, role?: UserRole) => {
    setLoading(true);
    setError(null); 
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseAuthUser = userCredential.user;
      
      const userRole = role || DEFAULT_USER_ROLE;
      const newUserProfileData = { 
        email: firebaseAuthUser.email || "",
        name: name || firebaseAuthUser.displayName || firebaseAuthUser.email?.split('@')[0] || "Nuevo Usuario",
        role: userRole,
      };

      const userDocRef = doc(db, "users", firebaseAuthUser.uid);
      await setDoc(userDocRef, newUserProfileData);
      
      if (firebaseAuthUser) {
        await sendEmailVerification(firebaseAuthUser);
        // No need to send password reset email immediately on signup,
        // user has just set their password. This can be a separate flow if needed.
        // await sendPasswordResetEmail(auth, email); 
      }
      
      // onAuthStateChanged will handle setting currentUser and loading to false.
      // setLoading(false); // Not strictly needed here as onAuthStateChanged will fire
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
