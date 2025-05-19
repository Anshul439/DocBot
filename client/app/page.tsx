'use client'

import { useEffect, useState } from "react";
import ChatComponent from "./components/chat";
import FileUploadComponent from "./components/file-upload";
import PDFListComponent from "./components/pdf-list"; // We'll create this new component
import { UserButton, SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";

export default function Home() {
  const { isSignedIn } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [availablePDFs, setAvailablePDFs] = useState([]);
  const [selectedPDF, setSelectedPDF] = useState(null);

  // Listen for the custom event from FileUploadComponent
  useEffect(() => {
    const handlePdfUploaded = () => {
      // Force components to refresh by changing the key
      setRefreshKey(prevKey => prevKey + 1);
      // Fetch PDFs after upload
      fetchAvailablePDFs();
    };
    
    window.addEventListener('pdf-uploaded', handlePdfUploaded);
    
    return () => {
      window.removeEventListener('pdf-uploaded', handlePdfUploaded);
    };
  }, []);

  // Fetch available PDFs when component mounts or user signs in
  useEffect(() => {
    if (isSignedIn) {
      fetchAvailablePDFs();
    }
  }, [isSignedIn, refreshKey]);

  const fetchAvailablePDFs = async () => {
    try {
      const response = await fetch("http://localhost:8000/pdfs");
      const data = await response.json();
      
      if (data.success && data.pdfs) {
        setAvailablePDFs(data.pdfs);
      }
    } catch (error) {
      console.error("Error fetching PDFs:", error);
    }
  };

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
        {/* Left Side Panel - Upload PDF & PDF List */}
        <div className="w-full md:w-[30%] border-r border-gray-800 flex flex-col overflow-hidden">
          {/* Upload Section - Top Half */}
          <div className="p-4 h-1/2 flex flex-col overflow-hidden">
            <h2 className="text-xl mb-4">Upload PDF</h2>
            <FileUploadComponent key={`upload-${refreshKey}`} />
          </div>
          
          {/* PDF List Section - Bottom Half */}
          <div className="border-t border-gray-800 p-4 h-1/2 flex flex-col overflow-hidden">
            <h2 className="text-xl mb-4">Your PDFs</h2>
            <PDFListComponent 
              pdfs={availablePDFs}
              selectedPDF={selectedPDF}
              setSelectedPDF={setSelectedPDF}
              onRefresh={fetchAvailablePDFs}
              key={`list-${refreshKey}`}
            />
          </div>
        </div>

        {/* Chat Section - Right Side */}
        <div className="w-full md:w-[70%] overflow-hidden">
          <ChatComponent 
            key={`chat-${refreshKey}`} 
            selectedPDF={selectedPDF} 
          />
        </div>
      </div>
    </div>
  );
}