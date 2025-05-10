import ChatComponent from "./components/chat";
import FileUploadComponent from "./components/file-upload";

export default function Home() {
  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold">PDF Chat Assistant</h1>
      </div>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* PDF Upload Section - Left Side */}
        <div className="w-full md:w-[30%] border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="p-4 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-xl mb-6">Upload PDF</h2>
            <FileUploadComponent />
          </div>
        </div>

        {/* Chat Section - Right Side */}
        <div className="w-full md:w-[70%] overflow-hidden">
          <ChatComponent />
        </div>
      </div>
    </div>
  );
}
