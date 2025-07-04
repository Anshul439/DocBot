"use client";

import { useEffect, useState, useCallback } from "react";
import ChatComponent from "./chat";
import FileUploadComponent from "./file-upload";
import PDFListComponent from "./pdf-list";
import { useAuth, useUser } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import {
  IMessage,
  IPDF,
  FetchPdfsResponse,
  FetchChatHistoryResponse,
} from "../app/types";

interface ClientHomePageProps {
  isSignedIn: boolean;
}

export default function ClientHomePage({ isSignedIn: serverIsSignedIn }: ClientHomePageProps) {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [availablePDFs, setAvailablePDFs] = useState<IPDF[]>([]);
  const [selectedPDF, setSelectedPDF] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<
    Record<string, IMessage[]>
  >({ all: [] });
  const [hasPDFs, setHasPDFs] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );

  const effectiveIsSignedIn = isSignedIn ?? serverIsSignedIn;

  const clearAllState = useCallback(() => {
    setAvailablePDFs([]);
    setSelectedPDF(null);
    setChatHistories({ all: [] });
    setHasPDFs(false);
    setLoadingStates({});
    setIsInitialLoad(true);
  }, []);

  const fetchAvailablePDFs = useCallback(async (): Promise<void> => {
    if (!effectiveIsSignedIn) {
      clearAllState();
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

        if (data.pdfs.length === 0) {
          setChatHistories({ all: [] });
          setSelectedPDF(null);
          setLoadingStates({});
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

          setLoadingStates((prev) => {
            const newLoadingStates = { ...prev };
            data.pdfs.forEach((pdf: IPDF) => {
              if (!(pdf.collectionName in newLoadingStates)) {
                newLoadingStates[pdf.collectionName] = false;
              }
            });
            if (!("all" in newLoadingStates)) {
              newLoadingStates["all"] = false;
            }
            return newLoadingStates;
          });
        }
      } else {
        clearAllState();
      }
    } catch (error) {
      console.error("Error fetching PDFs:", error);
      clearAllState();
    } finally {
      setIsInitialLoad(false);
    }
  }, [effectiveIsSignedIn, getToken, clearAllState]);

  useEffect(() => {
    if (!effectiveIsSignedIn) {
      clearAllState();
    }
  }, [effectiveIsSignedIn, clearAllState]);

  const fetchChatHistory = useCallback(
    async (collectionName: string | null): Promise<void> => {
      if (!effectiveIsSignedIn) return;

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("No authentication token available");
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_ROOT_URL}/chat/history?collectionName=${
            collectionName || ""
          }`,
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
    },
    [effectiveIsSignedIn, getToken]
  );

  useEffect(() => {
    if (user && effectiveIsSignedIn) {
      fetchAvailablePDFs();
    }

    const handlePdfUploaded = () => {
      fetchAvailablePDFs();
    };

    window.addEventListener("pdf-uploaded", handlePdfUploaded);
    return () => window.removeEventListener("pdf-uploaded", handlePdfUploaded);
  }, [user, effectiveIsSignedIn, fetchAvailablePDFs]);

  useEffect(() => {
    if (effectiveIsSignedIn && !isInitialLoad) {
      fetchChatHistory(selectedPDF);
    }
  }, [selectedPDF, effectiveIsSignedIn, isInitialLoad, fetchChatHistory]);

  const handleSelectPDF = useCallback((collectionName: string | null): void => {
    setSelectedPDF(collectionName);
    setMobileSidebarOpen(false);
  }, []);

  const updateChatHistory = useCallback(
    (collectionName: string | null, messages: IMessage[]): void => {
      const key = collectionName || "all";
      setChatHistories((prev) => ({
        ...prev,
        [key]: messages,
      }));
    },
    []
  );

  const handleMobileMenuClick = useCallback((): void => {
    setMobileSidebarOpen(!mobileSidebarOpen);
  }, [mobileSidebarOpen]);

  const handleOverlayClick = useCallback((): void => {
    setMobileSidebarOpen(false);
  }, []);

  return (
    <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
      {/* Fixed hamburger menu button - positioned to avoid overlap with title */}
      <button
        className="md:hidden fixed top-[18px] left-4 z-50 p-1.5 bg-[#1A1A1A] rounded-md border border-gray-700 shadow-sm"
        onClick={handleMobileMenuClick}
        aria-label="Toggle menu"
      >
        {mobileSidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Sidebar with consistent width */}
      <div
        className={`${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:relative inset-0 z-40 md:z-auto w-72 md:w-[30%] lg:w-[25%] bg-[#000000f7] md:bg-transparent border-r border-gray-800 flex flex-col transition-transform duration-300 ease-in-out`}
      >
        <div className="p-3 sm:p-4 h-1/2 flex flex-col overflow-hidden">
          <div className="flex justify-end md:justify-start items-center mb-3">
            <h2 className="text-lg sm:text-xl">Upload PDF</h2>
          </div>
          <FileUploadComponent />
        </div>

        <div className="border-t border-gray-800 p-3 sm:p-4 h-1/2 flex flex-col overflow-hidden">
          <div className="flex justify-end md:justify-start items-center mb-3">
            <h2 className="text-lg sm:text-xl">Your PDFs</h2>
          </div>
          <PDFListComponent
            pdfs={availablePDFs}
            selectedPDF={selectedPDF}
            setSelectedPDF={handleSelectPDF}
            onRefresh={fetchAvailablePDFs}
          />
        </div>
      </div>

      {/* Chat Section */}
      <div className="w-full md:w-[70%] lg:w-[75%] overflow-hidden relative">
        {mobileSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={handleOverlayClick}
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
          loadingStates={loadingStates}
          setLoadingStates={setLoadingStates}
        />
      </div>
    </div>
  );
}