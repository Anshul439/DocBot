"use client";

import { useEffect, useState } from "react";
import ChatComponent from "../components/chat";
import FileUploadComponent from "../components/file-upload";
import PDFListComponent from "../components/pdf-list";
import { UserButton, SignInButton, SignUpButton, useAuth, useUser } from "@clerk/nextjs";

interface IMessage {
  role: "assistant" | "user";
  content?: string;
  documents?: any[];
  timestamp?: string;
}

export default function Home() {
  const { isSignedIn } = useAuth();
  const [availablePDFs, setAvailablePDFs] = useState([]);
  const [selectedPDF, setSelectedPDF] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<
    Record<string, IMessage[]>
  >({
    all: [],
  });
    const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isLoaded: authLoaded } = useAuth();


  // Listen for PDF upload events
  useEffect(() => {
     console.log(user);
    fetchAvailablePDFs();
    const handlePdfUploaded = () => {
      fetchAvailablePDFs();
    };

    window.addEventListener("pdf-uploaded", handlePdfUploaded);
    return () => window.removeEventListener("pdf-uploaded", handlePdfUploaded);
  }, []);

  const fetchAvailablePDFs = async () => {
    try {
      const response = await fetch("http://localhost:8000/pdfs");
      const data = await response.json();

      if (data.success && data.pdfs) {
        setAvailablePDFs(data.pdfs);

        // Only initialize new PDF chat histories without overwriting existing ones
        setChatHistories((prev) => {
          const newHistories = { ...prev };
          data.pdfs.forEach((pdf: any) => {
            if (!newHistories[pdf.collectionName]) {
              newHistories[pdf.collectionName] = [];
            }
          });
          return newHistories;
        });
      }
    } catch (error) {
      console.error("Error fetching PDFs:", error);
    }
  };

  const handleSelectPDF = (collectionName: string | null) => {
    setSelectedPDF(collectionName);
  };

  const updateChatHistory = (
    collectionName: string | null,
    messages: IMessage[]
  ) => {
    const key = collectionName || "all";
    setChatHistories((prev) => ({
      ...prev,
      [key]: messages,
    }));
  };

  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h1 className="text-xl font-bold">PDF Chat Assistant</h1>
        <div className="flex items-center space-x-4">
          {!isSignedIn ? (
            <>
              <SignInButton mode="modal" forceRedirectUrl="/sync">
                <button className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 transition-colors">
                  Sign In
                </button>
              </SignInButton>
            </>
          ) : (
            <UserButton afterSignOutUrl="/" />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Left Side Panel */}
        <div className="w-full md:w-[30%] border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="p-4 h-1/2 flex flex-col overflow-hidden">
            <h2 className="text-xl mb-4">Upload PDF</h2>
            <FileUploadComponent />
          </div>

          <div className="border-t border-gray-800 p-4 h-1/2 flex flex-col overflow-hidden">
            <h2 className="text-xl mb-4">Your PDFs</h2>
            <PDFListComponent
              pdfs={availablePDFs}
              selectedPDF={selectedPDF}
              setSelectedPDF={handleSelectPDF}
              onRefresh={fetchAvailablePDFs}
            />
          </div>
        </div>

        {/* Chat Section */}
        <div className="w-full md:w-[70%] overflow-hidden">
          <ChatComponent
            selectedPDF={selectedPDF}
            chatHistory={
              selectedPDF
                ? chatHistories[selectedPDF] || []
                : chatHistories["all"]
            }
            updateChatHistory={updateChatHistory}
            availablePDFs={availablePDFs}
          />
        </div>
      </div>
    </div>
  );
}
