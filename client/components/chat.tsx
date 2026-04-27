"use client";

import { useState, useRef, useEffect } from "react";
import { SendIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import SignInPrompt from "./prompt";
import { IPDF, IMessage, ChatResponse, IDocument } from "../app/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatComponentProps {
  selectedPDF: string | null;
  chatHistory: IMessage[];
  updateChatHistory: (
    collectionName: string | null,
    messages: IMessage[]
  ) => void;
  availablePDFs: IPDF[];
  hasPDFs: boolean;
  loadingStates: Record<string, boolean>;
  setLoadingStates: (states: Record<string, boolean>) => void;
}

const ChatComponent: React.FC<ChatComponentProps> = ({
  selectedPDF,
  chatHistory,
  updateChatHistory,
  availablePDFs,
  hasPDFs,
  loadingStates,
  setLoadingStates,
}) => {
  const [message, setMessage] = useState<string>("");
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, getAuthHeaders } = useAuth();

  const currentChatKey = selectedPDF || "all";
  const loading = loadingStates[currentChatKey] || false;

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
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
      setIsInitialLoad(false);
    }, 0);

    return () => clearTimeout(timer);
  }, [selectedPDF]);

  useEffect(() => {
    if (chatHistory.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [chatHistory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setMessage("");
      setShowAuthPrompt(false);
    }
  }, [isSignedIn]);

  const setCurrentChatLoading = (isLoading: boolean): void => {
    setLoadingStates({
      ...loadingStates,
      [currentChatKey]: isLoading,
    });
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!message.trim() || loading) return;

    const userMessage: IMessage = {
      role: "user",
      content: message,
      timestamp: formatTime(),
    };

    const updatedHistory = [...chatHistory, userMessage];
    updateChatHistory(selectedPDF, updatedHistory);
    setMessage("");
    setCurrentChatLoading(true);

    try {
      const url = `${process.env.NEXT_PUBLIC_ROOT_URL}/chat?message=${encodeURIComponent(message)}${selectedPDF ? `&collection=${encodeURIComponent(selectedPDF)}` : ""}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
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
        timestamp: formatTime(),
      };

      updateChatHistory(selectedPDF, [...updatedHistory, assistantMessage]);
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: IMessage = {
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        timestamp: formatTime(),
      };
      updateChatHistory(selectedPDF, [...updatedHistory, errorMessage]);
    } finally {
      setCurrentChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputFocus = (): void => {
    // no-op: guests are allowed to use chat
  };

  const handleMessageChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    setMessage(e.target.value);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status bar showing which PDF is selected - moved to top */}
      {isSignedIn && hasPDFs && (
        <div className="border-b border-gray-800 p-2 md:p-3 text-xs md:text-sm text-gray-400">
          {selectedPDF ? (
            <span>
              Chatting with:{" "}
              <span className="text-indigo-400 font-medium">
                {availablePDFs.find((pdf) => pdf.collectionName === selectedPDF)
                  ?.originalFilename || "Selected PDF"}
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
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3 md:space-y-4 pb-16 md:pb-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-track]:bg-gray-900"
        style={{
          minHeight: 0,
          scrollBehavior: "auto",
        }}
      >
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"
              }`}
          >
            <div
              className={`max-w-[90%] md:max-w-[80%] p-2 md:p-3 rounded-lg text-sm md:text-base ${msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-[#1A1A1A] text-white"
                }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                      em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
                      code: ({ children }) => <code className="bg-gray-800 text-indigo-300 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                      pre: ({ children }) => <pre className="bg-gray-800 p-3 rounded-lg overflow-x-auto mb-2 text-xs">{children}</pre>,
                      h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                    }}
                  >
                    {msg.content || ""}
                  </ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
              {msg.documents && msg.documents.length > 0 && (() => {
                // Deduplicate sources by filename + page number
                const seen = new Set<string>();
                const uniqueSources = msg.documents
                  .map((doc: IDocument) => {
                    const filename = doc.metadata?.originalFilename
                      || (doc.metadata?.source
                        ? doc.metadata.source.split("/").pop()?.replace(/^\d+-\d+-/, "") ?? "Document"
                        : "Document");
                    const page = doc.metadata?.loc?.pageNumber ?? null;
                    return { filename, page };
                  })
                  .filter(({ filename, page }: { filename: string; page: number | null }) => {
                    const key = `${filename}-${page}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });

                return (
                  <div className="mt-3 pt-2 border-t border-gray-700">
                    <p className="text-xs font-semibold text-gray-400 mb-1">Sources</p>
                    <div className="flex flex-wrap gap-1">
                      {uniqueSources.map(({ filename, page }: { filename: string; page: number | null }, i: number) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full"
                        >
                          <span className="text-indigo-400">📄</span>
                          {filename}
                          {page && <span className="text-gray-500 ml-1">Page {page}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
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

      {/* Input area - fixed at bottom on mobile */}
      <div className="fixed bottom-0 left-0 right-0 md:static bg-[#000000f7] p-2 md:p-4 border-t border-gray-800 md:border-t-0">
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
            className={`p-1 md:p-2 rounded-lg mx-1 ${!message.trim() || loading
                ? "opacity-50 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 transition-all duration-200"
              }`}
          >
            <SendIcon className="h-4 w-4 md:h-5 md:w-5 text-white" />
          </button>
        </div>
      </div>

    </div>
  );
};

export default ChatComponent;