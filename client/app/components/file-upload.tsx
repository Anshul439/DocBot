"use client";

import { Upload } from "lucide-react";
import { useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import SignInPrompt from "./prompt";

const FileUploadComponent = () => {
  const [file, setFile] = useState(null);
  const [fileSize, setFileSize] = useState("");
  const [fileName, setFileName] = useState("");
  const [isUploaded, setIsUploaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const fileInputRef = useRef(null);
  const { isSignedIn } = useAuth();

  const handleFileUpload = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setFileSize((selectedFile.size / (1024 * 1024)).toFixed(2) + " MB");
      setIsUploaded(true);

      // Upload the file
      const formData = new FormData();
      formData.append("pdf", selectedFile);
      fetch("http://localhost:8000/upload/pdf", {
        method: "POST",
        body: formData,
      });
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
    }
  };

  const handleChangeFile = () => {
    if (!isSignedIn) {
      setShowAuthPrompt(true);
      return;
    }
    
    setFile(null);
    setFileName("");
    setFileSize("");
    setIsUploaded(false);
  };

  const handleAreaClick = () => {
    if (!isUploaded) {
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
    
    fileInputRef.current?.click();
  };

  return (
    <>
      <div
        className={`border-2 border-dashed border-gray-800 rounded-lg flex-1 flex justify-center items-center hover:bg-[#121212fd] transition-colors duration-300 cursor-pointer hover:border-indigo-900 ${isHovered ? 'border-indigo-900 bg-[#121212fd]' : ''}`}
        onClick={handleAreaClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!isUploaded ? (
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
              <Upload className="h-6 w-6 text-indigo-500" />
            </div>
            <h3 className="text-center font-medium mb-1">{fileName}</h3>
            <p className="text-gray-500 text-sm mb-6">{fileSize}</p>
            <button
              onClick={handleChangeFile}
              className="bg-[#1A1A1A] text-white px-6 py-2 rounded text-sm hover:bg-[#252525] transition duration-200"
            >
              Change File
            </button>
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