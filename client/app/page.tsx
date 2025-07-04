import { UserButton, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import ClientHomePage from "@/components/client-home";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header with adjusted padding */}
      <div className="p-3 sm:p-4 pb-4 border-b border-gray-800 flex justify-between items-center relative">
        {/* Left spacer for mobile - same width as hamburger button */}
        <div className="w-8 md:w-0 flex-shrink-0 md:hidden"></div>
        
        <div className="flex items-center space-x-2 sm:space-x-4 flex-1 md:flex-initial justify-center md:justify-start">
          <h1 className="text-lg sm:text-xl font-bold">DocBot</h1>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          {!userId ? (
            <SignInButton mode="modal" forceRedirectUrl={"/sync"}>
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 sm:py-2 sm:px-4 rounded-sm transition-colors text-xs sm:text-sm md:text-base">
                Sign In
              </button>
            </SignInButton>
          ) : (
            <UserButton afterSignOutUrl="/" />
          )}
        </div>
      </div>

      <ClientHomePage isSignedIn={!!userId} />
    </div>
  );
}