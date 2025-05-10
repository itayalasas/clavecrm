
"use client";

import type { User as FirebaseUser, UserCredential } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut as firebaseSignOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import type { User } from "@/lib/types"; // Your app's User type

interface AuthContextType {
  currentUser: User | null; // App specific User type
  firebaseUser: FirebaseUser | null; // Firebase User type
  loading: boolean;
  error: Error | null;
  login: (email: string, pass: string) => Promise<UserCredential>;
  signup: (email: string, pass: string, name?: string) => Promise<UserCredential>;
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
        // Fetch additional user data from Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUser({ id: user.uid, ...userDocSnap.data() } as User);
        } else {
          // This case might happen if Firestore doc wasn't created or user was created via Firebase console
          // For now, we'll set a minimal user object. Consider creating the doc here if needed.
           const newUser: User = {
            id: user.uid,
            email: user.email || "",
            name: user.displayName || user.email?.split('@')[0] || "Usuario Anónimo",
            role: "user", // Default role
          };
          // Optionally create the document if it's missing
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
    return signInWithEmailAndPassword(auth, email, pass)
      .catch(err => { setError(err); setLoading(false); throw err; });
  };

  const signup = async (email: string, pass: string, name?: string) => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const user = userCredential.user;
      // Create user document in Firestore
      const userDocRef = doc(db, "users", user.uid);
      const newUserProfile: Omit<User, 'id' | 'avatarUrl'> = { // avatarUrl is optional
        email: user.email || "",
        name: name || user.displayName || user.email?.split('@')[0] || "Nuevo Usuario",
        role: "user", // Default role
      };
      await setDoc(userDocRef, newUserProfile);
      setCurrentUser({id: user.uid, ...newUserProfile}); // Update local state
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
