
"use client";

import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import SignInPrompt from "./prompt";

enum UploadStatus {
  IDLE,
  UPLOADING,
  PROCESSING,
  SUCCESS,
  ERROR
}

const FileUploadComponent = () => {
  const [file, setFile] = useState(null);
  const [fileSize, setFileSize] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(UploadStatus.IDLE);
  const [statusMessage, setStatusMessage] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const fileInputRef = useRef(null);
  const { isSignedIn } = useAuth();

  // Check job status periodically if there's an active job
  useEffect(() => {
    if (jobId && uploadStatus === UploadStatus.PROCESSING) {
      const interval = setInterval(checkJobStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [jobId, uploadStatus]);

  const checkJobStatus = async () => {
    if (!jobId) return;
    
    try {
      const response = await fetch(`http://localhost:8000/job/${jobId}`);
      const data = await response.json();
      
      if (data.success) {
        if (data.state === 'completed') {
          setUploadStatus(UploadStatus.SUCCESS);
          setStatusMessage('PDF processed successfully!');
          // Clear job tracking
          setJobId(null);
          
          // Notify parent component that PDFs have changed
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pdf-uploaded'));
          }
        } else if (data.state === 'failed') {
          setUploadStatus(UploadStatus.ERROR);
          setStatusMessage('Processing failed. Please try again.');
          setJobId(null);
        }
        // else it's still processing, continue polling
      }
    } catch (error) {
      console.error("Error checking job status:", error);
    }
  };

  const handleFileUpload = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;
    
    // Only accept PDFs
    if (selectedFile.type !== "application/pdf") {
      setUploadStatus(UploadStatus.ERROR);
      setStatusMessage("Only PDF files are supported");
      return;
    }
    
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setFileSize((selectedFile.size / (1024 * 1024)).toFixed(2) + " MB");
    setUploadStatus(UploadStatus.UPLOADING);
    setStatusMessage("Uploading file...");

    // Upload the file
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
      setStatusMessage(error instanceof Error ? error.message : "Upload failed");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsHovered(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsHovered(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsHovered(false);
    
    if (!isSignedIn) {
      setShowAuthPrompt(true);
      return;
    }
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "application/pdf") {
      handleFileUpload({ target: { files: [droppedFile] } });
    } else {
      setUploadStatus(UploadStatus.ERROR);
      setStatusMessage("Only PDF files are supported");
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileName("");
    setFileSize("");
    setUploadStatus(UploadStatus.IDLE);
    setStatusMessage("");
    setJobId(null);
  };

  const handleAreaClick = () => {
    if (!isUploading && !isProcessing) {
      if (!isSignedIn) {
        setShowAuthPrompt(true);
      }
    }
  };

  const handleSelectPdfClick = (e) => {
    e.stopPropagation(); // Prevent the parent div's onClick from firing
    
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

  // Render status icon based on current state
  const renderStatusIcon = () => {
    if (isUploading || isProcessing) {
      return <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />;
    } else if (isSuccess) {
      return <CheckCircle className="h-6 w-6 text-green-500" />;
    } else if (isError) {
      return <AlertCircle className="h-6 w-6 text-red-500" />;
    } else {
      return <Upload className="h-6 w-6 text-indigo-500" />;
    }
  };

  return (
    <>
      <div
        className={`border-2 border-dashed border-gray-800 rounded-lg flex-1 flex justify-center items-center transition-colors duration-300 cursor-pointer 
        ${isHovered ? 'border-indigo-900 bg-[#121212fd]' : ''} 
        ${isUploading || isProcessing ? 'cursor-wait opacity-80' : 'hover:bg-[#121212fd] hover:border-indigo-900'} 
        ${isSuccess ? 'border-green-900' : ''} 
        ${isError ? 'border-red-900' : ''}`}
        onClick={handleAreaClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isIdle ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="bg-[#1A1A1A] rounded-full p-4 mb-6">
              <Upload className="h-6 w-6 text-indigo-500" />
            </div>
            <p className="mb-2 text-gray-200">Drag & drop or click to upload</p>
            <p className="text-sm text-gray-500 mb-6">
              Supports PDF files up to 10MB
            </p>
            <div 
              className="bg-[#1A1A1A] text-white px-6 py-2 rounded text-sm hover:bg-[#252525] transition duration-200"
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
          <div className="flex flex-col items-center w-full px-4">
            <div className="bg-[#1A1A1A] rounded-full p-4 mb-4">
              {renderStatusIcon()}
            </div>
            <h3 className="text-center font-medium mb-1 max-w-full truncate px-4">{fileName}</h3>
            <p className="text-gray-500 text-sm mb-2">{fileSize}</p>
            
            {/* Status message */}
            <p className={`text-sm mb-4 ${
              isSuccess ? 'text-green-500' : 
              isError ? 'text-red-500' : 
              'text-indigo-400'
            }`}>
              {statusMessage}
            </p>
            
            {/* Button changes based on status */}
            {!isUploading && !isProcessing && (
              <button
                onClick={handleReset}
                className="bg-[#1A1A1A] text-white px-6 py-2 rounded text-sm hover:bg-[#252525] transition duration-200"
              >
                {isError ? "Try Again" : "Upload Another"}
              </button>
            )}
            
            {/* Progress indicator for processing */}
            {isProcessing && (
              <div className="w-full max-w-xs bg-gray-800 rounded-full h-1.5 mb-4">
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