"use client";

import { useState, useRef, useEffect } from "react";
import { SendIcon, Trash2Icon } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import SignInPrompt from "./prompt";

interface Doc {
  pageContent?: string;
  metadata?: {
    loc?: {
      pageNumber?: number;
    };
    source?: string;
    collectionName?: string;
    score?: number;
  };
}

interface IMessage {
  role: "assistant" | "user";
  content?: string;
  documents?: Doc[];
  timestamp?: string;
}

interface PDF {
  originalFilename: string;
  collectionName: string;
  uploadTime: string;
  chunks: number;
}

const ChatComponent = () => {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const [availablePDFs, setAvailablePDFs] = useState<PDF[]>([]);
  const [selectedPDF, setSelectedPDF] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isSignedIn } = useAuth();

  // Format timestamp as HH:MM AM/PM
  const formatTime = () => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${minutes} ${ampm}`;
  };

  // Fetch available PDFs when component mounts
  useEffect(() => {
    if (isSignedIn) {
      fetchAvailablePDFs();
    }
  }, [isSignedIn]);

  const fetchAvailablePDFs = async () => {
    try {
      const response = await fetch("http://localhost:8000/pdfs");
      const data = await response.json();
      
      if (data.success && data.pdfs) {
        setAvailablePDFs(data.pdfs);
      }
    } catch (error) {
      console.error("Error fetching PDFs:", error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim() || loading) return;

    if (!isSignedIn) {
      // Show auth prompt with smooth animation
      setShowAuthPrompt(true);
      return;
    }

    const userMessage = {
      role: "user",
      content: message,
      timestamp: formatTime(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setLoading(true);

    try {
      // Add selected collection to the URL if a PDF is selected
      let url = `http://localhost:8000/chat?message=${encodeURIComponent(message)}`;
      if (selectedPDF) {
        url += `&collection=${encodeURIComponent(selectedPDF)}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to get response");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message,
          documents: data.documents,
          timestamp: formatTime(),
        },
      ]);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputFocus = () => {
    if (!isSignedIn) {
      // Show auth prompt with smooth animation
      setShowAuthPrompt(true);
    }
  };

  const handleSelectPDF = (collectionName: string) => {
    setSelectedPDF(collectionName === selectedPDF ? null : collectionName);
  };

  const handleDeletePDF = async (collectionName: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent selecting when deleting
    
    if (confirm("Are you sure you want to delete this PDF?")) {
      try {
        const response = await fetch(`http://localhost:8000/pdf/${collectionName}`, {
          method: "DELETE",
        });
        
        const data = await response.json();
        
        if (data.success) {
          // Refresh PDF list
          fetchAvailablePDFs();
          
          // If the deleted PDF was selected, clear selection
          if (selectedPDF === collectionName) {
            setSelectedPDF(null);
          }
        }
      } catch (error) {
        console.error("Error deleting PDF:", error);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* PDF selector bar */}
      {isSignedIn && availablePDFs.length > 0 && (
        <div className="border-b border-gray-800 p-2 overflow-x-auto whitespace-nowrap">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400 min-w-fit">Select PDF: </span>
            <button
              onClick={() => setSelectedPDF(null)}
              className={`text-sm px-3 py-1 rounded ${
                selectedPDF === null
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              All PDFs
            </button>
            {availablePDFs.map((pdf) => (
              <div key={pdf.collectionName} className="flex items-center">
                <button
                  onClick={() => handleSelectPDF(pdf.collectionName)}
                  className={`text-sm px-3 py-1 rounded flex items-center ${
                    selectedPDF === pdf.collectionName
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {pdf.originalFilename}
                  <span className="ml-2 text-xs opacity-60">({pdf.chunks} chunks)</span>
                </button>
                <button 
                  onClick={(e) => handleDeletePDF(pdf.collectionName, e)}
                  className="ml-1 p-1 text-gray-500 hover:text-red-500 rounded hover:bg-gray-800"
                  title="Delete PDF"
                >
                  <Trash2Icon size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-[#1A1A1A] text-white"
              }`}
            >
              {msg.content}
              {msg.documents && msg.documents.length > 0 && (
                <div className="mt-2 text-xs text-gray-300">
                  <p className="font-semibold">Sources:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    {msg.documents.map((doc, i) => (
                      <li key={i}>
                        {doc.metadata?.source || "Document"} (Page{" "}
                        {doc.metadata?.loc?.pageNumber || "N/A"})
                        {doc.metadata?.score && (
                          <span className="ml-1 opacity-70">
                            [Score: {doc.metadata.score.toFixed(2)}]
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500 mt-1">{msg.timestamp}</span>
          </div>
        ))}
        {loading && (
          <div className="flex items-start">
            <div className="bg-[#1A1A1A] text-white p-3 rounded-lg">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4">
        <div className="flex items-center bg-[#0F0F0F] rounded-lg overflow-hidden border border-gray-800">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            placeholder={selectedPDF ? "Ask a question about this PDF..." : "Ask a question about your PDFs..."}
            className="flex-1 bg-[#0F0F0F] text-white p-3 px-4 focus:outline-none"
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || loading}
            className={`p-2 rounded-lg mx-1 ${
              !message.trim() || loading
                ? "opacity-50 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 transition-all duration-200"
            }`}
          >
            <SendIcon className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
      
      {showAuthPrompt && (
        <SignInPrompt onClose={() => setShowAuthPrompt(false)} />
      )}
    </div>
  );
};

export default ChatComponent;