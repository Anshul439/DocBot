"use client";

import { useState, useEffect } from "react";
import { SignInButton } from "@clerk/nextjs";

const SignInPrompt = ({ onClose }: { onClose: () => void }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleClose = () => {
    setIsVisible(false);
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
        className={`bg-[#1A1A1A] rounded-lg p-4 max-w-xs w-full mx-4 transform transition-all duration-300 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <h2 className="text-center text-lg font-bold mb-3 text-white">Authentication Required</h2>
        <p className="text-center text-gray-300 mb-4 text-sm">
          Please sign in to use this feature.
        </p>
        <div className="flex flex-col gap-2">
          <SignInButton mode="modal">
            <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-sm transition-colors text-sm">
              Sign In
            </button>
          </SignInButton>
          
          <button 
            onClick={handleClose}
            className="w-full border border-gray-700 text-gray-400 py-2 px-4 rounded hover:bg-[#252525] transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignInPrompt;