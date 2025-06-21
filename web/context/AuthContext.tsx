'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Create or update user profile in Firestore
        await createUserProfile(user);
        
        // Redirect authenticated users away from auth pages
        if (pathname.startsWith('/auth/')) {
          router.push('/upload');
        }
      }
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, [router, pathname]);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Helper function to create user profile
async function createUserProfile(user: User) {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      authProvider: user.providerData[0]?.providerId.includes('google') ? 'google' : 'email',
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    });
  } else {
    // Update last login time
    await setDoc(userRef, {
      lastLoginAt: serverTimestamp()
    }, { merge: true });
  }
} 