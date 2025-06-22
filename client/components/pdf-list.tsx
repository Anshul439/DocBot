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

  try {
    // Optimistic UI update
    const updatedPDFs = pdfs.filter(pdf => pdf.collectionName !== collectionName);
    onRefresh(updatedPDFs); // Pass the updated list

    const token = await getToken();
    const response = await fetch(
      `http://localhost:8000/pdf/${collectionName}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!data.success) {
      // If deletion failed, refetch the actual state
      onRefresh(); // Call without parameters to trigger full refresh
      throw new Error(data.error || "Failed to delete PDF");
    }

    if (selectedPDF === collectionName) {
      setSelectedPDF(null);
    }
  } catch (error) {
    console.error("Error deleting PDF:", error);
    onRefresh(); // Fallback refresh if something went wrong
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
    <div className="flex-1 overflow-y-auto">
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
                className="ml-2 p-1 md:p-1.5 text-inherit opacity-60 hover:opacity-100 rounded hover:bg-black hover:bg-opacity-20"
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
