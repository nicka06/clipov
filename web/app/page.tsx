import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            Welcome to{' '}
            <span className="text-blue-600">Clipov</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Your intelligent video compilation platform. Upload, analyze, and create amazing video content with the power of AI.
          </p>
          
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            <div className="rounded-md shadow">
              <a href="/auth/signup">
                <Button className="w-full sm:w-auto px-8 py-3">
                  Get Started
                </Button>
              </a>
            </div>
            <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
              <a href="/auth/signin">
                <Button variant="secondary" className="w-full sm:w-auto px-8 py-3">
                  Sign In
                </Button>
              </a>
            </div>
          </div>
        </div>
        
        {/* Feature Preview */}
        <div className="mt-16">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">
              Coming Soon
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Advanced video processing and AI-powered compilation features
            </p>
          </div>
          
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900">Smart Upload</h3>
              <p className="mt-2 text-gray-600">
                Efficient video upload with progress tracking and error handling
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900">AI Analysis</h3>
              <p className="mt-2 text-gray-600">
                Intelligent video analysis and content recognition
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900">Auto Compilation</h3>
              <p className="mt-2 text-gray-600">
                Automated video compilation based on AI insights
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
