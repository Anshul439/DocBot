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

    // Prevent multiple clicks
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

      // Success: Update UI state
      const updatedPDFs = pdfs.filter(
        (pdf) => pdf.collectionName !== collectionName
      );

      // If the deleted PDF was selected, clear selection
      if (selectedPDF === collectionName) {
        setSelectedPDF(null);
      }

      // Update the PDF list
      onRefresh(updatedPDFs);

      console.log(`Successfully deleted PDF: ${collectionName}`);
    } catch (error) {
      console.error("Error deleting PDF:", error);

      // Show user-friendly error message
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete PDF";
      alert(`Error: ${errorMessage}`);

      // Re-enable button
      button.disabled = false;
      button.classList.remove("opacity-50", "cursor-not-allowed");

      // Refresh to get current state from server
      onRefresh();
    }
  };

  if (!pdfs || pdfs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No PDFs uploaded yet
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto  [&::-webkit-scrollbar]:w-2 Add commentMore actions
    [&::-webkit-scrollbar-thumb]:rounded-full 
    [&::-webkit-scrollbar-thumb]:bg-gray-700 
    [&::-webkit-scrollbar-track]:bg-gray-900"
    >
      <div className="space-y-1 md:space-y-2">
        <button
          onClick={() => setSelectedPDF(null)}
          className={`w-full text-left text-xs md:text-sm px-3 py-2 md:px-4 md:py-3 rounded-md flex items-center justify-between ${
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
              className="w-full text-left text-xs md:text-sm px-3 py-2 md:px-4 md:py-3 flex items-center justify-between"
            >
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate">
                  {pdf.originalFilename}
                </div>
                <div className="text-xs opacity-70 mt-1 flex items-center space-x-2">
                  <span>{pdf.chunks} pages</span>
                </div>
              </div>
              <button
                onClick={(e) => handleDeletePDF(pdf.collectionName, e)}
                className="ml-2 p-1 md:p-1.5 text-inherit opacity-60 hover:opacity-100 rounded hover:bg-black hover:bg-opacity-20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete PDF"
              >
                <Trash2Icon size={14} className="md:w-4 md:h-4" />
              </button>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PDFListComponent;
