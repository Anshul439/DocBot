"use client";

import { useState, useRef, useEffect } from "react";
import { SendIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { IPDF, IMessage, IDocument } from "../app/types";
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

const MarkdownMessage = ({ content }: { content: string }) => (
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
      {content || ""}
    </ReactMarkdown>
  </div>
);

const SourceBadges = ({ documents }: { documents: IDocument[] }) => {
  const seen = new Set<string>();
  const unique = documents
    .map((doc) => {
      const filename =
        doc.metadata?.originalFilename ||
        (doc.metadata?.source
          ? doc.metadata.source.split("/").pop()?.replace(/^\d+-\d+-/, "") ?? "Document"
          : "Document");
      const page = doc.metadata?.loc?.pageNumber ?? null;
      return { filename, page };
    })
    .filter(({ filename, page }) => {
      const key = `${filename}-${page}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (unique.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-gray-700">
      <p className="text-xs font-semibold text-gray-400 mb-1">Sources</p>
      <div className="flex flex-wrap gap-1">
        {unique.map(({ filename, page }, i) => (
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
};

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
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);

  // Streaming state
  const [streamingText, setStreamingText] = useState<string>("");
  const [streamingDocs, setStreamingDocs] = useState<IDocument[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { getAuthHeaders } = useAuth();

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

  const scrollToBottom = (force = false): void => {
    if (!messagesContainerRef.current || !messagesEndRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 120;
    if (force || nearBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
      return;
    }
    // Always scroll to bottom when streaming (so user sees latest token)
    if (isStreaming) {
      scrollToBottom(true);
      return;
    }
    scrollToBottom();
  }, [chatHistory, streamingText, isStreaming]);

  useEffect(() => {
    setIsInitialLoad(true);
  }, [selectedPDF]);

  const setCurrentChatLoading = (isLoading: boolean) => {
    setLoadingStates({
      ...loadingStates,
      [currentChatKey]: isLoading,
    });
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!message.trim() || loading || isStreaming) return;

    const userMessage: IMessage = {
      role: "user",
      content: message,
      timestamp: formatTime(),
    };

    const historyWithUser = [...chatHistory, userMessage];
    updateChatHistory(selectedPDF, historyWithUser);
    setMessage("");
    // Force-scroll after React re-renders with the new user message
    setTimeout(() => scrollToBottom(true), 0);
    setCurrentChatLoading(true);
    setIsStreaming(true);
    setStreamingText("");
    setStreamingDocs([]);

    const capturedMessage = message;

    try {
      const url = `${process.env.NEXT_PUBLIC_ROOT_URL}/chat?message=${encodeURIComponent(capturedMessage)}${
        selectedPDF ? `&collection=${encodeURIComponent(selectedPDF)}` : ""
      }`;

      const response = await fetch(url, {
        method: "GET",
        headers: { ...getAuthHeaders() },
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let finalDocs: IDocument[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE chunks are separated by \n\n
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          let evt: any;
          try { evt = JSON.parse(json); } catch { continue; }

          if (evt.type === "token") {
            accumulated += evt.content;
            setStreamingText(accumulated);
          } else if (evt.type === "documents") {
            finalDocs = evt.documents ?? [];
            setStreamingDocs(finalDocs);
          } else if (evt.type === "done") {
            // commit to chat history
            const assistantMessage: IMessage = {
              role: "assistant",
              content: accumulated,
              documents: finalDocs,
              timestamp: formatTime(),
            };
            updateChatHistory(selectedPDF, [...historyWithUser, assistantMessage]);
            setStreamingText("");
            setStreamingDocs([]);
          } else if (evt.type === "error") {
            throw new Error(evt.message || "Stream error");
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: IMessage = {
        role: "assistant",
        content: error instanceof Error ? error.message : "An unexpected error occurred",
        timestamp: formatTime(),
      };
      updateChatHistory(selectedPDF, [...historyWithUser, errorMessage]);
      setStreamingText("");
      setStreamingDocs([]);
    } finally {
      setIsStreaming(false);
      setCurrentChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setMessage(e.target.value);
  };

  const isBusy = loading || isStreaming;

  return (
    <div className="grid h-full overflow-hidden" style={{ gridTemplateRows: "auto 1fr auto" }}>
      {/* Status bar — auto */}
      {hasPDFs && (
        <div className="border-b border-gray-800 px-3 py-2 text-xs text-gray-400">
          {selectedPDF ? (
            <span>
              Chatting with{" "}
              <span className="text-indigo-400 font-medium">
                {availablePDFs.find((pdf) => pdf.collectionName === selectedPDF)
                  ?.originalFilename || "Selected PDF"}
              </span>
            </span>
          ) : availablePDFs.length > 1 ? (
            <span>
              Comparing{" "}
              <span className="text-indigo-400 font-medium">{availablePDFs.length} PDFs</span>
            </span>
          ) : (
            <span>
              Chatting with{" "}
              <span className="text-indigo-400 font-medium">All PDFs</span>
            </span>
          )}
        </div>
      )}

      {/* Messages area — 1fr (fills remaining height) */}
      <div
        ref={messagesContainerRef}
        className="overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4
          [&::-webkit-scrollbar]:w-2
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb]:bg-gray-700
          [&::-webkit-scrollbar-track]:bg-gray-900"
      >
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[90%] md:max-w-[80%] p-2 md:p-3 rounded-lg text-sm md:text-base ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-[#1A1A1A] text-white"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownMessage content={msg.content ?? ""} />
              ) : (
                msg.content
              )}
              {msg.documents && msg.documents.length > 0 && (
                <SourceBadges documents={msg.documents} />
              )}
            </div>
          </div>
        ))}

        {/* Live streaming bubble */}
        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="max-w-[90%] md:max-w-[80%] p-2 md:p-3 rounded-lg text-sm md:text-base bg-[#1A1A1A] text-white">
              {streamingText ? (
                <>
                  <MarkdownMessage content={streamingText} />
                  {/* blinking cursor */}
                  <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
                </>
              ) : (
                /* dots while waiting for first token */
                <div className="flex space-x-1.5 py-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                </div>
              )}
              {streamingDocs.length > 0 && <SourceBadges documents={streamingDocs} />}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar — auto */}
      <div className="border-t border-gray-800 p-2 sm:p-3 bg-[#000000f7]">
        <div className="flex items-center bg-[#0F0F0F] rounded-xl overflow-hidden border border-gray-800 focus-within:border-gray-600 transition-colors">
          <input
            type="text"
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder={
              hasPDFs
                ? selectedPDF
                  ? "Ask about this PDF..."
                  : availablePDFs.length > 1
                    ? "Compare or ask across all PDFs..."
                    : "Ask about your PDFs..."
                : "Upload a PDF to start chatting..."
            }
            className="flex-1 bg-transparent text-white p-3 px-4 focus:outline-none text-sm sm:text-base"
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || isBusy}
            className={`p-2 rounded-lg mx-1 ${
              !message.trim() || isBusy
                ? "opacity-40 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 transition-colors duration-200"
            }`}
          >
            <SendIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatComponent;