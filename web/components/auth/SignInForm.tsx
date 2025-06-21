'use client';
import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRouter } from 'next/navigation';

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Let AuthContext handle the user state, redirect will happen naturally
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // Let AuthContext handle the user state, redirect will happen naturally
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        
        {error && <p className="text-red-500 text-sm">{error}</p>}
        
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Signing In...' : 'Sign In'}
        </Button>
      </form>
      
      <div className="mt-4">
        <Button 
          onClick={handleGoogleSignIn} 
          variant="secondary" 
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Signing In...' : 'Sign In with Google'}
        </Button>
      </div>
      
      <div className="mt-4 text-center">
        <a 
          href="/auth/forgot-password" 
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Forgot your password?
        </a>
      </div>
    </div>
  );
} 