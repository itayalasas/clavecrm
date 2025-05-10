
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
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore"; // Added collection, getDocs, deleteDoc
import type { User, UserRole } from "@/lib/types"; 
import { DEFAULT_USER_ROLE } from "@/lib/constants";

interface AuthContextType {
  currentUser: User | null; 
  firebaseUser: FirebaseUser | null; 
  loading: boolean;
  error: Error | null;
  login: (email: string, pass: string) => Promise<UserCredential>;
  signup: (email: string, pass: string, name: string, role: UserRole) => Promise<UserCredential>; // name is now mandatory
  logout: () => Promise<void>;
  getAllUsers: () => Promise<User[]>; // New function
  // deleteUser: (userId: string) => Promise<void>; // Placeholder for future
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

  const signup = async (email: string, pass: string, name: string, role: UserRole) => {
    setLoading(true);
    setError(null); 
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseAuthUser = userCredential.user;
      
      const newUserProfileData = { 
        email: firebaseAuthUser.email || "",
        name: name, // Use provided name
        role: role, // Use provided role
      };

      const userDocRef = doc(db, "users", firebaseAuthUser.uid);
      await setDoc(userDocRef, newUserProfileData);
      
      // Send verification and password reset emails
      if (firebaseAuthUser) {
        await sendEmailVerification(firebaseAuthUser);
        await sendPasswordResetEmail(auth, email); 
      }
      
      // onAuthStateChanged will handle setting currentUser if this signup logs the user in.
      // For admin creation, this user won't become the currentUser for the admin.
      // setLoading(false); // Not strictly needed here as onAuthStateChanged might fire
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

  const getAllUsers = async (): Promise<User[]> => {
    setLoading(true);
    setError(null);
    try {
      const usersCol = collection(db, "users");
      const userSnapshot = await getDocs(usersCol);
      const userList = userSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setLoading(false);
      return userList;
    } catch (err: any) {
      setError(err);
      setLoading(false);
      throw err;
    }
  };

  // Placeholder for delete user function
  // const deleteUser = async (userId: string): Promise<void> => {
  //   setLoading(true);
  //   setError(null);
  //   try {
  //     // This is complex: needs an admin SDK or a Cloud Function to delete Firebase Auth user.
  //     // Deleting Firestore doc is easy:
  //     // await deleteDoc(doc(db, "users", userId));
  //     // For now, this is a placeholder.
  //     console.warn("User deletion from Firebase Auth requires Admin SDK or Cloud Function.");
  //     await deleteDoc(doc(db, "users", userId)); // Example: delete from Firestore only
  //     setLoading(false);
  //   } catch (err: any) {
  //     setError(err);
  //     setLoading(false);
  //     throw err;
  //   }
  // };

  const value = {
    currentUser,
    firebaseUser,
    loading,
    error,
    login,
    signup,
    logout,
    getAllUsers,
    // deleteUser, 
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
