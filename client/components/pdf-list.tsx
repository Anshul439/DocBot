"use client";

import { Trash2Icon } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { IPDF } from "../app/types";

interface PDFListComponentProps {
  pdfs: IPDF[];
  selectedPDF: string | null;
  setSelectedPDF: (collectionName: string | null) => void;
  onRefresh: (updatedPDFs?: IPDF[]) => void;
}

const PDFListComponent: React.FC<PDFListComponentProps> = ({
  pdfs,
  selectedPDF,
  setSelectedPDF,
  onRefresh,
}) => {
  const { getToken } = useAuth();

  const handleDeletePDF = async (
    collectionName: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();

    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled) return;

    button.disabled = true;
    button.classList.add("opacity-50", "cursor-not-allowed");

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_ROOT_URL}/pdf/${collectionName}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || `HTTP ${response.status}: Failed to delete PDF`
        );
      }

      const updatedPDFs = pdfs.filter(
        (pdf) => pdf.collectionName !== collectionName
      );

      if (selectedPDF === collectionName) {
        setSelectedPDF(null);
      }

      onRefresh(updatedPDFs);
    } catch (error) {
      console.error("Error deleting PDF:", error);
      alert(
        error instanceof Error ? error.message : "Failed to delete PDF"
      );
      button.disabled = false;
      button.classList.remove("opacity-50", "cursor-not-allowed");
      onRefresh();
    }
  };

  if (!pdfs || pdfs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-xs sm:text-sm">
        No PDFs uploaded yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-1">
        <button
          onClick={() => setSelectedPDF(null)}
          className={`w-full text-left text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 rounded-md flex items-center justify-between ${
            selectedPDF === null
              ? "bg-indigo-600 text-white"
              : "bg-[#1A1A1A] text-gray-300 hover:bg-[#252525]"
          }`}
        >
          <span className="font-medium">All PDFs</span>
        </button>

        {pdfs.map((pdf) => (
          <div
            key={pdf.collectionName}
            className={`rounded-md ${
              selectedPDF === pdf.collectionName
                ? "bg-indigo-600 text-white"
                : "bg-[#1A1A1A] text-gray-300 hover:bg-[#252525]"
            }`}
          >
            <button
              onClick={() => setSelectedPDF(pdf.collectionName)}
              className="w-full text-left rounded-md"
            >
              <div className="text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 flex items-center justify-between">
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium truncate">
                    {pdf.originalFilename}
                  </div>
                  <div className="text-2xs opacity-70 mt-0.5 flex items-center space-x-1">
                    <span>{pdf.chunks} pages</span>
                  </div>
                </div>
                <div
                  role="button"
                  aria-label={`Delete ${pdf.originalFilename}`}
                  tabIndex={0}
                  onClick={(e) => handleDeletePDF(pdf.collectionName, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleDeletePDF(
                        pdf.collectionName,
                        e as unknown as React.MouseEvent
                      );
                    }
                  }}
                  className="ml-1 p-1 text-inherit opacity-60 hover:opacity-100 rounded hover:bg-black hover:bg-opacity-20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2Icon size={12} className="sm:w-4 sm:h-4" />
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PDFListComponent;