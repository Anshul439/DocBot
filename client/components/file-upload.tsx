"use client";

import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import SignInPrompt from "./prompt";
import { UploadStatus } from "../app/types";

interface FileUploadComponentProps {
  onUploadSuccess?: () => void;
}

const FileUploadComponent: React.FC<FileUploadComponentProps> = () => {
  // const [file, setFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(UploadStatus.IDLE);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (jobId && uploadStatus === UploadStatus.PROCESSING) {
      const interval = setInterval(checkJobStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [jobId, uploadStatus]);

  const checkJobStatus = async (): Promise<void> => {
    if (!jobId) return;

    try {
      const response = await fetch(`http://localhost:8000/job/${jobId}`);
      const data = await response.json();

      if (data.success) {
        if (data.state === "completed") {
          setUploadStatus(UploadStatus.SUCCESS);
          setStatusMessage("PDF processed successfully!");
          setJobId(null);

          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("pdf-uploaded"));
          }
        } else if (data.state === "failed") {
          setUploadStatus(UploadStatus.ERROR);
          setStatusMessage("Processing failed. Please try again.");
          setJobId(null);
        }
      }
    } catch (error) {
      console.error("Error checking job status:", error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setUploadStatus(UploadStatus.ERROR);
      setStatusMessage("Only PDF files are supported");
      return;
    }

    // setFile(selectedFile);
    setFileName(selectedFile.name);
    setFileSize(`${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`);
    setUploadStatus(UploadStatus.UPLOADING);
    setStatusMessage("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("pdf", selectedFile);

      const response = await fetch("http://localhost:8000/upload/pdf", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setUploadStatus(UploadStatus.PROCESSING);
        setStatusMessage("Processing PDF...");
        setJobId(data.jobId);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setUploadStatus(UploadStatus.ERROR);
      setStatusMessage(
        error instanceof Error ? error.message : "Upload failed"
      );
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsHovered(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsHovered(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsHovered(false);

    if (!isSignedIn) {
      setShowAuthPrompt(true);
      return;
    }

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "application/pdf") {
      const event = {
        target: {
          files: [droppedFile]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(event);
    } else {
      setUploadStatus(UploadStatus.ERROR);
      setStatusMessage("Only PDF files are supported");
    }
  };

  const handleReset = (): void => {
    // setFile(null);
    setFileName("");
    setFileSize("");
    setUploadStatus(UploadStatus.IDLE);
    setStatusMessage("");
    setJobId(null);
  };

  const handleAreaClick = (): void => {
    if (!isUploading && !isProcessing) {
      if (!isSignedIn) {
        setShowAuthPrompt(true);
      }
    }
  };

  const handleSelectPdfClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();

    if (!isSignedIn) {
      setShowAuthPrompt(true);
      return;
    }

    if (!isUploading && !isProcessing) {
      fileInputRef.current?.click();
    }
  };

  const isUploading = uploadStatus === UploadStatus.UPLOADING;
  const isProcessing = uploadStatus === UploadStatus.PROCESSING;
  const isSuccess = uploadStatus === UploadStatus.SUCCESS;
  const isError = uploadStatus === UploadStatus.ERROR;
  const isIdle = uploadStatus === UploadStatus.IDLE;

  const renderStatusIcon = ()=> {
    if (isUploading || isProcessing) {
      return (
        <Loader2 className="h-5 w-5 md:h-6 md:w-6 text-indigo-500 animate-spin" />
      );
    } else if (isSuccess) {
      return <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-green-500" />;
    } else if (isError) {
      return <AlertCircle className="h-5 w-5 md:h-6 md:w-6 text-red-500" />;
    } else {
      return <Upload className="h-5 w-5 md:h-6 md:w-6 text-indigo-500" />;
    }
  };

  return (
    <>
      <div
        className={`border-2 border-dashed border-gray-800 rounded-lg flex-1 flex justify-center items-center transition-colors duration-300 cursor-pointer 
        ${isHovered ? "border-indigo-900 bg-[#121212fd]" : ""} 
        ${
          isUploading || isProcessing
            ? "cursor-wait opacity-80"
            : "hover:bg-[#121212fd] hover:border-indigo-900"
        } 
        ${isSuccess ? "border-green-900" : ""} 
        ${isError ? "border-red-900" : ""}`}
        onClick={handleAreaClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isIdle ? (
          <div className="flex flex-col items-center justify-center p-4 md:p-8 text-center">
            <div className="bg-[#1A1A1A] rounded-full p-3 md:p-4 mb-4 md:mb-6">
              <Upload className="h-5 w-5 md:h-6 md:w-6 text-indigo-500" />
            </div>
            <p className="mb-2 text-gray-200 text-sm md:text-base">
              Drag & drop or click to upload
            </p>
            <p className="text-xs md:text-sm text-gray-500 mb-4 md:mb-6">
              Supports PDF files up to 10MB
            </p>
            <div
              className="bg-[#1A1A1A] text-white px-4 py-1 md:px-6 md:py-2 rounded text-xs md:text-sm hover:bg-[#252525] transition duration-200"
              onClick={handleSelectPdfClick}
            >
              Select PDF
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="application/pdf"
                onChange={handleFileUpload}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full px-2 md:px-4">
            <div className="bg-[#1A1A1A] rounded-full p-3 md:p-4 mb-2 md:mb-4">
              {renderStatusIcon()}
            </div>
            <h3 className="text-center font-medium mb-1 max-w-full truncate px-2 md:px-4 text-sm md:text-base">
              {fileName}
            </h3>
            <p className="text-gray-500 text-xs md:text-sm mb-2">{fileSize}</p>

            <p
              className={`text-sm mb-3 md:mb-4 ${
                isSuccess
                  ? "text-green-500"
                  : isError
                  ? "text-red-500"
                  : "text-indigo-400"
              }`}
            >
              {statusMessage}
            </p>

            {!isUploading && !isProcessing && (
              <button
                onClick={handleReset}
                className="bg-[#1A1A1A] text-white px-4 py-1 md:px-6 md:py-2 rounded text-xs md:text-sm hover:bg-[#252525] transition duration-200"
              >
                {isError ? "Try Again" : "Upload Another"}
              </button>
            )}

            {isProcessing && (
              <div className="w-full max-w-xs bg-gray-800 rounded-full h-1.5 mb-3 md:mb-4">
                <div className="bg-indigo-600 h-1.5 rounded-full animate-pulse"></div>
              </div>
            )}
          </div>
        )}
      </div>

      {showAuthPrompt && (
        <SignInPrompt onClose={() => setShowAuthPrompt(false)} />
      )}
    </>
  );
};

export default FileUploadComponent;