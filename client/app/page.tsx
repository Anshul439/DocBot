"use client";

import { useEffect, useState, useCallback } from "react";
import ChatComponent from "../components/chat";
import FileUploadComponent from "../components/file-upload";
import PDFListComponent from "../components/pdf-list";
import { UserButton, SignInButton, useAuth, useUser } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { IMessage, IPDF, FetchPdfsResponse, FetchChatHistoryResponse } from "../app/types";

export default function Home() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [availablePDFs, setAvailablePDFs] = useState<IPDF[]>([]);
  const [selectedPDF, setSelectedPDF] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<Record<string, IMessage[]>>({ all: [] });
  const [hasPDFs, setHasPDFs] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  // Add loading states for each chat context
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

const fetchAvailablePDFs = useCallback(async (): Promise<void> => {
  if (!isSignedIn) {
    setAvailablePDFs([]);
    setHasPDFs(false);
    return;
  }

  try {
    const token = await getToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_ROOT_URL}/pdfs`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: FetchPdfsResponse = await response.json();

    if (data.success && data.pdfs) {
      setAvailablePDFs(data.pdfs);
      setHasPDFs(data.pdfs.length > 0);

      // Clear chat history if no PDFs remain
      if (data.pdfs.length === 0) {
        setChatHistories({ all: [] });
        setSelectedPDF(null);
        setLoadingStates({}); // Clear loading states
      } else {
        setChatHistories((prev) => {
          const newHistories = { ...prev };
          data.pdfs.forEach((pdf: IPDF) => {
            if (!newHistories[pdf.collectionName]) {
              newHistories[pdf.collectionName] = [];
            }
          });
          return newHistories;
        });
        
        // Initialize loading states for new PDFs
        setLoadingStates((prev) => {
          const newLoadingStates = { ...prev };
          data.pdfs.forEach((pdf: IPDF) => {
            if (!(pdf.collectionName in newLoadingStates)) {
              newLoadingStates[pdf.collectionName] = false;
            }
          });
          if (!('all' in newLoadingStates)) {
            newLoadingStates['all'] = false;
          }
          return newLoadingStates;
        });
      }
    } else {
      setHasPDFs(false);
      // Clear chat history when fetch fails or no PDFs
      setChatHistories({ all: [] });
      setSelectedPDF(null);
      setLoadingStates({});
    }
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    setHasPDFs(false);
  } finally {
    setIsInitialLoad(false);
  }
}, [isSignedIn, getToken]);

  const fetchChatHistory = useCallback(async (collectionName: string | null): Promise<void> => {
    if (!isSignedIn) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_ROOT_URL}/chat/history?collectionName=${collectionName || ""}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: FetchChatHistoryResponse = await response.json();

      if (data.success && data.messages) {
        updateChatHistory(collectionName, data.messages);
      }
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  }, [isSignedIn, getToken]);

  // Single useEffect for initial data loading
  useEffect(() => {
    if (user && isSignedIn) {
      fetchAvailablePDFs();
    }

    const handlePdfUploaded = () => {
      fetchAvailablePDFs();
    };

    window.addEventListener("pdf-uploaded", handlePdfUploaded);
    return () => window.removeEventListener("pdf-uploaded", handlePdfUploaded);
  }, [user, isSignedIn, fetchAvailablePDFs]);

  // Separate useEffect for handling PDF selection and chat history loading
  useEffect(() => {
    if (isSignedIn && !isInitialLoad) {
      fetchChatHistory(selectedPDF);
    }
  }, [selectedPDF, isSignedIn, isInitialLoad, fetchChatHistory]);

  const handleSelectPDF = useCallback((collectionName: string | null): void => {
    setSelectedPDF(collectionName);
    setMobileSidebarOpen(false);
  }, []);

  const updateChatHistory = useCallback((
    collectionName: string | null,
    messages: IMessage[]
  ): void => {
    const key = collectionName || "all";
    setChatHistories((prev) => ({
      ...prev,
      [key]: messages,
    }));
  }, []);

  const handleMobileMenuClick = useCallback((): void => {
    setMobileSidebarOpen(!mobileSidebarOpen);
  }, [mobileSidebarOpen]);

  const handleOverlayClick = useCallback((): void => {
    setMobileSidebarOpen(false);
  }, []);

  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <button
            className="md:hidden"
            onClick={handleMobileMenuClick}
            aria-label="Toggle menu"
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
        <div
          className={`${
            mobileSidebarOpen ? "block" : "hidden"
          } md:block fixed md:relative inset-0 z-40 md:z-auto w-full md:w-[30%] bg-[#000000f7] md:bg-transparent border-r border-gray-800 flex flex-col overflow-y-auto`}
        >
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
              onClick={handleOverlayClick}
            />
          )}
          {/* Only render chat when not in initial loading state */}
          {!isInitialLoad && (
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
              loadingStates={loadingStates}
              setLoadingStates={setLoadingStates}
            />
          )}
          {/* Show loading state during initial load */}
          {isInitialLoad && (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">Loading...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}