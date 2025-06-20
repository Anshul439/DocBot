"use client";

import { useState, useRef, useEffect } from "react";
import { SendIcon } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import SignInPrompt from "./prompt";
import {
  IPDF,
  IMessage,
  ChatResponse,
  IDocument
} from "../app/types";

interface ChatComponentProps {
  selectedPDF: string | null;
  chatHistory: IMessage[];
  updateChatHistory: (
    collectionName: string | null,
    messages: IMessage[]
  ) => void;
  availablePDFs: IPDF[];
  hasPDFs: boolean;
}

const ChatComponent: React.FC<ChatComponentProps> = ({
  selectedPDF,
  chatHistory,
  updateChatHistory,
  availablePDFs,
  hasPDFs,
}) => {
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, getToken } = useAuth();

  const formatTime = (): string => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const formatResponse = (content: string): string => {
    return content
      .replace(/\n/g, "<br />")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/- /g, "<br />- ")
      .replace(/(\d+\. )/g, "<br />$1")
      .replace(/• /g, "<br />• ")
      .replace(/\n\n/g, "<br /><br />");
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!message.trim() || loading) return;

    if (!isSignedIn) {
      setShowAuthPrompt(true);
      return;
    }

    const userMessage: IMessage = {
      role: "user",
      content: message,
      timestamp: formatTime()
    };

    const updatedHistory = [...chatHistory, userMessage];
    updateChatHistory(selectedPDF, updatedHistory);
    setMessage("");
    setLoading(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("No authentication token available");

      let url = `http://localhost:8000/chat?message=${encodeURIComponent(message)}`;
      if (selectedPDF) {
        url += `&collection=${encodeURIComponent(selectedPDF)}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ChatResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage: IMessage = {
        role: "assistant",
        content: data.message,
        documents: data.documents,
        timestamp: formatTime()
      };

      updateChatHistory(selectedPDF, [...updatedHistory, assistantMessage]);
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: IMessage = {
        role: "assistant",
        content: error instanceof Error ? error.message : "An unexpected error occurred",
        timestamp: formatTime()
      };
      updateChatHistory(selectedPDF, [...updatedHistory, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputFocus = (): void => {
    if (!isSignedIn) {
      setShowAuthPrompt(true);
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setMessage(e.target.value);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status bar showing which PDF is selected */}
      {isSignedIn && hasPDFs && (
        <div className="border-b border-gray-800 p-2 md:p-3 text-xs md:text-sm text-gray-400">
          {selectedPDF ? (
            <span>
              Chatting with:{" "}
              <span className="text-indigo-400 font-medium">
                {availablePDFs.find(
                  (pdf) => pdf.collectionName === selectedPDF
                )?.originalFilename || "Selected PDF"}
              </span>
            </span>
          ) : (
            <span>
              Chatting with:{" "}
              <span className="text-indigo-400 font-medium">All PDFs</span>
            </span>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3 md:space-y-4">
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div className="text-xs text-gray-400 mb-1">
              {msg.timestamp || formatTime()}
            </div>
            <div
              className={`max-w-[90%] md:max-w-[80%] p-2 md:p-3 rounded-lg text-sm md:text-base ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-[#1A1A1A] text-white"
              }`}
            >
              {msg.role === "assistant" ? (
                <div
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: formatResponse(msg.content || ""),
                  }}
                />
              ) : (
                msg.content
              )}
              {msg.documents && msg.documents.length > 0 && (
                <div className="mt-2 text-xs opacity-70">
                  <p className="font-semibold">Sources:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    {msg.documents.map((doc: IDocument, i: number) => (
                      <li key={i}>
                        {doc.metadata?.source || "Document"} (Page{" "}
                        {doc.metadata?.loc?.pageNumber || "N/A"})
                        {doc.metadata?.score && (
                          <span className="ml-1">
                            [Score: {doc.metadata.score.toFixed(2)}]
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
      <div className="p-2 md:p-4">
        <div className="flex items-center bg-[#0F0F0F] rounded-lg overflow-hidden border border-gray-800">
          <input
            type="text"
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            placeholder={
              hasPDFs
                ? selectedPDF
                  ? "Ask about this PDF..."
                  : "Ask about your PDFs..."
                : "Upload a PDF to start chatting..."
            }
            className="flex-1 bg-[#0F0F0F] text-white p-2 md:p-3 px-3 md:px-4 focus:outline-none text-sm md:text-base"
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || loading}
            className={`p-1 md:p-2 rounded-lg mx-1 ${
              !message.trim() || loading
                ? "opacity-50 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 transition-all duration-200"
            }`}
          >
            <SendIcon className="h-4 w-4 md:h-5 md:w-5 text-white" />
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