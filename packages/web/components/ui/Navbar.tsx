'use client';
import { Button } from './Button';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await logout();
    router.push('/');
  };

  // Check if current page is active
  const isActivePage = (path: string) => {
    if (path === '/upload') {
      return pathname === '/upload' || pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link href={user ? "/upload" : "/"} className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                {/* Simple logo - you can replace with an actual logo file later */}
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-gray-900">Clipov</span>
              </div>
            </Link>
          </div>

          {/* Center Navigation Links - Only show when authenticated */}
          {user && (
            <div className="hidden md:flex items-center space-x-8">
              <Link 
                href="/upload"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActivePage('/upload')
                    ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Upload
              </Link>
              
              {/* Projects link - always show for authenticated users */}
              <Link 
                href="/projects"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActivePage('/projects')
                    ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Projects
              </Link>
            </div>
          )}

          {/* Right side - Auth buttons */}
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                {/* Mobile navigation menu for smaller screens */}
                <div className="md:hidden">
                  <div className="flex items-center space-x-2">
                    <Link 
                      href="/upload"
                      className={`px-2 py-1 rounded text-xs ${
                        isActivePage('/upload')
                          ? 'text-blue-600 bg-blue-50'
                          : 'text-gray-500'
                      }`}
                    >
                      Upload
                    </Link>
                    <Link 
                      href="/projects"
                      className={`px-2 py-1 rounded text-xs ${
                        isActivePage('/projects')
                          ? 'text-blue-600 bg-blue-50'
                          : 'text-gray-500'
                      }`}
                    >
                      Projects
                    </Link>
                  </div>
                </div>
                
                <span className="text-sm text-gray-600 hidden sm:block">
                  Welcome, {user.email?.split('@')[0]}
                </span>
                <Button onClick={handleSignOut} variant="secondary" className="text-sm">
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button 
                  onClick={() => router.push('/auth/signin')}
                  variant="secondary" 
                  className="text-sm"
                >
                  Sign In
                </Button>
                <Button 
                  onClick={() => router.push('/auth/signup')}
                  className="text-sm"
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
} 