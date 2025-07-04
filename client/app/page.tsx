import { UserButton, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import ClientHomePage from "@/components/client-home";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header with adjusted layout */}
      <div className="p-3 sm:p-4 pb-4 border-b border-gray-800 flex justify-between items-center relative">
        {/* Empty div to balance the layout */}
        <div className="w-8 md:w-0"></div>
        
        {/* Centered title */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <h1 className="text-lg sm:text-xl font-bold">DocBot</h1>
        </div>
        
        {/* Auth buttons */}
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