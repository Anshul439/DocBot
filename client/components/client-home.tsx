"use client";

import { useEffect, useState, useCallback } from "react";
import ChatComponent from "./chat";
import FileUploadComponent from "./file-upload";
import PDFListComponent from "./pdf-list";
import { useAuth } from "@/lib/auth-context";
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
  const { isSignedIn, getAuthHeaders, user } = useAuth();
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
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_ROOT_URL}/pdfs`, {
        headers: {
          ...getAuthHeaders(),
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
  }, [getAuthHeaders, clearAllState]);

  useEffect(() => {
    if (!effectiveIsSignedIn) {
      clearAllState();
    }
  }, [effectiveIsSignedIn, clearAllState]);

  const fetchChatHistory = useCallback(
    async (collectionName: string | null): Promise<void> => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_ROOT_URL}/chat/history?collectionName=${collectionName || ""}`,
          { headers: { ...getAuthHeaders() } }
        );

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data: FetchChatHistoryResponse = await response.json();
        if (data.success && data.messages) {
          updateChatHistory(collectionName, data.messages);
        }
      } catch (error) {
        console.error("Error fetching chat history:", error);
      }
    },
    [getAuthHeaders]
  );

  useEffect(() => {
    // Always fetch PDFs on mount (works for both guests and signed-in users)
    fetchAvailablePDFs();

    const handlePdfUploaded = () => {
      fetchAvailablePDFs();
    };

    window.addEventListener("pdf-uploaded", handlePdfUploaded);
    return () => window.removeEventListener("pdf-uploaded", handlePdfUploaded);
  }, [user, effectiveIsSignedIn, fetchAvailablePDFs]);

  useEffect(() => {
    if (!isInitialLoad) {
      fetchChatHistory(selectedPDF);
    }
  }, [selectedPDF, isInitialLoad, fetchChatHistory]);

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
    <div className="flex h-full w-full overflow-hidden">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      {/* Mobile: fixed full-screen overlay that slides in from the left       */}
      {/* Desktop: static flex column, takes 28% of width                      */}
      <aside
        className={[
          // positioning
          "fixed inset-0 z-40",
          "md:relative md:inset-auto md:z-auto",
          // sizing
          "md:w-80 lg:w-96",
          // visibility — mobile slides, desktop always shown
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          // appearance
          "bg-[#0a0a0a] border-r border-gray-800",
          "flex flex-col overflow-hidden",
          "transition-transform duration-300 ease-in-out",
        ].join(" ")}
      >
        {/* Close button — mobile only */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-gray-300">Menu</span>
          <button onClick={handleOverlayClick} className="p-1 rounded hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {/* Upload section */}
        <div className="shrink-0 p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Upload PDF</h2>
          <FileUploadComponent />
        </div>

        {/* PDF list */}
        <div className="flex-1 min-h-0 p-4 flex flex-col">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Your PDFs</h2>
          <div className="flex-1 min-h-0 flex flex-col">
            <PDFListComponent
              pdfs={availablePDFs}
              selectedPDF={selectedPDF}
              setSelectedPDF={(pdf) => {
                handleSelectPDF(pdf);
                setMobileSidebarOpen(false); // close sidebar when selecting on mobile
              }}
              onRefresh={fetchAvailablePDFs}
            />
          </div>
        </div>
      </aside>

      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={handleOverlayClick}
        />
      )}

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
          <button
            onClick={handleMobileMenuClick}
            className="p-1.5 bg-[#1A1A1A] rounded-md border border-gray-700"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm text-gray-400 truncate">
            {selectedPDF
              ? availablePDFs.find(p => p.collectionName === selectedPDF)?.originalFilename || "PDF"
              : availablePDFs.length > 1 ? `${availablePDFs.length} PDFs` : "All PDFs"}
          </span>
        </div>

        {/* Chat */}
        <div className="flex-1 min-h-0 overflow-hidden">
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
    </div>
  );
}