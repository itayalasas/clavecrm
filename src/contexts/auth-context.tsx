
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
      setLoading(true); // Set loading true at the start of auth state change processing
      setError(null); // Clear previous errors
      try {
        setFirebaseUser(user);
        if (user) {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setCurrentUser({ 
              id: user.uid, 
              email: user.email || "", // Ensure email is always present
              name: userData.name || user.displayName || user.email?.split('@')[0] || "Usuario Anónimo", // Ensure name is present
              role: userData.role || DEFAULT_USER_ROLE, // Ensure role is present
              avatarUrl: userData.avatarUrl, // Include avatarUrl if present
              ...userData, // Spread other potential fields from Firestore
            } as User);
          } else {
            // User exists in Auth but not Firestore. Create Firestore doc.
            // This scenario typically occurs if signup process was interrupted or for externally created users.
            const newUserProfile: User = {
              id: user.uid,
              email: user.email || "",
              name: user.displayName || user.email?.split('@')[0] || "Usuario Anónimo",
              role: DEFAULT_USER_ROLE, // Assign default role
              // avatarUrl can be added later if needed
            };
            await setDoc(userDocRef, { 
              email: newUserProfile.email, 
              name: newUserProfile.name,
              role: newUserProfile.role 
            });
            setCurrentUser(newUserProfile);
          }
        } else {
          setCurrentUser(null);
        }
      } catch (e: any) {
        console.error("Error processing auth state change:", e);
        setError(e);
        setCurrentUser(null); // Ensure user is cleared on error
      } finally {
        setLoading(false); // Ensure loading is set to false after processing
      }
    }, (authError) => { // Error callback for onAuthStateChanged listener itself
      console.error("Firebase onAuthStateChanged error:", authError);
      setError(authError);
      setCurrentUser(null);
      setFirebaseUser(null);
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
    // This signup is for creating new users by an admin, not for self-registration by the current user.
    // Global loading state should not be affected by this admin action.
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
        // Consider if sending password reset immediately is desired for admin-created users.
        // It might be better to let them use the initial password or have a separate "force password reset" flow.
        // For now, we'll send it as per previous implementation.
        await sendPasswordResetEmail(auth, email); 
      }
      
      return userCredential;
    } catch (err: any) {
      // Log error, but don't set global error/loading for this admin action
      console.error("Error during admin signup:", err);
      throw err;
    }
  };

  const logout = () => {
    // setLoading(true) will be handled by onAuthStateChanged when user becomes null
    return firebaseSignOut(auth);
  };

  const getAllUsers = async (): Promise<User[]> => {
    // This function fetches data for a specific page,
    // it should not manage the global loading/error state of AuthContext.
    // The calling component (UserManagementPage) will handle its own loading/error states.
    try {
      const usersCol = collection(db, "users");
      const userSnapshot = await getDocs(usersCol);
      const userList = userSnapshot.docs.map(docSnap => ({ 
          id: docSnap.id, 
          email: docSnap.data().email || "",
          name: docSnap.data().name || "Usuario Anónimo",
          role: docSnap.data().role || DEFAULT_USER_ROLE,
          avatarUrl: docSnap.data().avatarUrl,
          ...docSnap.data() 
        } as User));
      return userList;
    } catch (err: any) {
      console.error("Error fetching all users:", err);
      throw err; // Rethrow for the calling component to handle
    }
  };

  // Placeholder for delete user function
  // const deleteUser = async (userId: string): Promise<void> => {
  //   try {
  //     // This is complex: needs an admin SDK or a Cloud Function to delete Firebase Auth user.
  //     // Deleting Firestore doc is easy:
  //     // await deleteDoc(doc(db, "users", userId));
  //     // For now, this is a placeholder.
  //     console.warn("User deletion from Firebase Auth requires Admin SDK or Cloud Function.");
  //     await deleteDoc(doc(db, "users", userId)); // Example: delete from Firestore only
  //   } catch (err: any) {
  //     console.error("Error deleting user:", err);
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

