"use client";

import { useState } from "react";
import { LogOut, User } from "lucide-react";
import ClientHomePage from "@/components/client-home";
import AuthModal from "@/components/auth-modal";
import GuestBanner from "@/components/guest-banner";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { isSignedIn, isLoaded, user, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  const openSignIn = () => {
    setAuthMode("signin");
    setShowAuth(true);
  };

  if (!isLoaded) {
    return (
      <div className="bg-[#000000f7] h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header */}
      <div className="p-3 sm:p-4 pb-4 border-b border-gray-800 flex justify-between items-center relative">
        <div className="w-8 md:w-0 flex-shrink-0 md:hidden" />

        <div className="flex items-center space-x-2 sm:space-x-4 flex-1 md:flex-initial justify-center md:justify-start">
          <a href="/" className="hover:opacity-80 transition-opacity">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">DocBot</h1>
          </a>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          {!isSignedIn ? (
            <button
              id="sign-in-btn"
              onClick={openSignIn}
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 sm:py-2 sm:px-4 rounded-sm transition-colors text-xs sm:text-sm md:text-base"
            >
              Sign In
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
                  <User size={13} className="text-indigo-400" />
                </div>
                <span className="hidden sm:block text-xs text-gray-400 max-w-[120px] truncate">
                  {user?.name}
                </span>
              </div>
              <button
                id="sign-out-btn"
                onClick={signOut}
                title="Sign out"
                className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
              >
                <LogOut size={14} />
                <span className="hidden sm:block">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <GuestBanner />
      <ClientHomePage isSignedIn={isSignedIn} />

      {showAuth && (
        <AuthModal
          defaultMode={authMode}
          onClose={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}