"use client";

import { useState, useRef, useEffect } from "react";
import { SendIcon } from "lucide-react";

interface Doc {
  pageContent?: string;
  metadata?: {
    loc?: {
      pageNumber?: number;
    };
    source?: string;
  };
}

interface IMessage {
  role: "assistant" | "user";
  content?: string;
  documents?: Doc[];
  timestamp?: string;
}

const ChatComponent = () => {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim() || loading) return;

    const userMessage = {
      role: "user",
      content: message,
      timestamp: formatTime(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:8000/chat?message=${encodeURIComponent(message)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

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

  return (
    <div className="flex flex-col h-full">
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
            placeholder="Ask a question about your PDF..."
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
    </div>
  );
};

export default ChatComponent;
