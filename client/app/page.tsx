"use client";

import { useEffect, useState } from "react";
import ChatComponent from "../components/chat";
import FileUploadComponent from "../components/file-upload";
import PDFListComponent from "../components/pdf-list";
import { UserButton, SignInButton, useAuth, useUser } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";

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
  const [chatHistories, setChatHistories] = useState<Record<string, IMessage[]>>({ all: [] });
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const [hasPDFs, setHasPDFs] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
        setHasPDFs(data.pdfs.length > 0);

        setChatHistories((prev) => {
          const newHistories = { ...prev };
          data.pdfs.forEach((pdf: any) => {
            if (!newHistories[pdf.collectionName]) {
              newHistories[pdf.collectionName] = [];
            }
          });
          return newHistories;
        });
      } else {
        setHasPDFs(false);
      }
    } catch (error) {
      console.error("Error fetching PDFs:", error);
      setHasPDFs(false);
    }
  };

  const fetchChatHistory = async (collectionName: string | null) => {
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:8000/chat/history?collectionName=${collectionName || ''}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        updateChatHistory(collectionName, data.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          documents: msg.documents,
          timestamp: msg.timestamp
        })));
      }
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  };

  const handleSelectPDF = (collectionName: string | null) => {
    setSelectedPDF(collectionName);
    if (isSignedIn) {
      fetchChatHistory(collectionName);
    }
    setMobileSidebarOpen(false);
  };

  const updateChatHistory = (collectionName: string | null, messages: IMessage[]) => {
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
        <div className="flex items-center space-x-4">
          <button 
            className="md:hidden"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          >
            {mobileSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 className="text-xl font-bold">PDF Chat Assistant</h1>
        </div>
        <div className="flex items-center space-x-4">
          {!isSignedIn ? (
            <SignInButton mode="modal" forceRedirectUrl="/sync">
              <button className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 transition-colors text-sm md:text-base">
                Sign In
              </button>
            </SignInButton>
          ) : (
            <UserButton afterSignOutUrl="/" />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Left Side Panel - Mobile Overlay */}
        <div className={`${mobileSidebarOpen ? 'block' : 'hidden'} md:block fixed md:relative inset-0 z-40 md:z-auto w-full md:w-[30%] bg-[#000000f7] md:bg-transparent border-r border-gray-800 flex flex-col overflow-y-auto`}>
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
        <div className="w-full md:w-[70%] overflow-hidden relative">
          {mobileSidebarOpen && (
            <div 
              className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
          <ChatComponent
            selectedPDF={selectedPDF}
            chatHistory={
              selectedPDF
                ? chatHistories[selectedPDF] || []
                : chatHistories["all"]
            }
            updateChatHistory={updateChatHistory}
            availablePDFs={availablePDFs}
            hasPDFs={hasPDFs}
          />
        </div>
      </div>
    </div>
  );
}