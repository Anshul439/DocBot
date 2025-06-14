"use client";

import { useState, useEffect } from "react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";

const SignInPrompt = ({ onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Start animation after component mounts
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleClose = () => {
    // Start fade out animation
    setIsVisible(false);
    
    // Wait for animation to complete before actually closing
    setTimeout(onClose, 300);
  };
  
  return (
    <div 
      className={`fixed inset-0 bg-black flex items-center justify-center z-50 transition-opacity duration-300 ease-in-out ${
        isVisible ? 'bg-opacity-70 opacity-100' : 'bg-opacity-0 opacity-0'
      }`}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div 
        className={`bg-[#1A1A1A] rounded-lg p-6 max-w-md w-full mx-4 transform transition-all duration-300 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <h2 className="text-xl font-bold mb-4 text-white">Authentication Required</h2>
        <p className="text-gray-300 mb-6">
          Please sign in or create an account to use this feature.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <SignInButton mode="modal" forceRedirectUrl="/sync">
            <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded transition-colors">
              Sign In
            </button>
          </SignInButton>
          
          {/* <SignUpButton mode="modal">
            <button className="w-full bg-[#2D2D2D] hover:bg-[#3D3D3D] text-white py-2 px-4 rounded transition-colors">
              Sign Up
            </button>
          </SignUpButton> */}
        </div>
        
        <button 
          onClick={handleClose}
          className="mt-4 w-full border border-gray-700 text-gray-400 py-2 px-4 rounded hover:bg-[#252525] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default SignInPrompt;