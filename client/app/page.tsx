'use client'

import { useEffect, useState } from "react";
import ChatComponent from "./components/chat";
import FileUploadComponent from "./components/file-upload";
import { UserButton, SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";

export default function Home() {
  const { isSignedIn } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for the custom event from FileUploadComponent
  useEffect(() => {
    const handlePdfUploaded = () => {
      // Force ChatComponent to refresh by changing the key
      setRefreshKey(prevKey => prevKey + 1);
    };
    
    window.addEventListener('pdf-uploaded', handlePdfUploaded);
    
    return () => {
      window.removeEventListener('pdf-uploaded', handlePdfUploaded);
    };
  }, []);

  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h1 className="text-xl font-bold">PDF Chat Assistant</h1>
        <div className="flex items-center space-x-4">
          {!isSignedIn ? (
            <>
              <SignInButton mode="modal">
                <button className="px-4 py-2 rounded-md bg-transparent hover:bg-[#1A1A1A] transition-colors">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 transition-colors">
                  Sign Up
                </button>
              </SignUpButton>
            </>
          ) : (
            <UserButton afterSignOutUrl="/" />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* PDF Upload Section - Left Side */}
        <div className="w-full md:w-[30%] border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="p-4 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-xl mb-6">Upload PDF</h2>
            <FileUploadComponent />
          </div>
        </div>

        {/* Chat Section - Right Side */}
        <div className="w-full md:w-[70%] overflow-hidden">
          <ChatComponent key={refreshKey} />
        </div>
      </div>
    </div>
  );
}