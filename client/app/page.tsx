import { UserButton, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import ClientHomePage from "@/components/client-home";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="bg-[#000000f7] text-white h-screen flex flex-col">
      {/* Header - Server rendered */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">DocBot</h1>
        </div>
        <div className="flex items-center space-x-4">
          {!userId ? (
            <SignInButton mode="modal" forceRedirectUrl={"/sync"}>
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-sm transition-colors text-sm md:text-base">
                Sign In
              </button>
            </SignInButton>
          ) : (
            <UserButton afterSignOutUrl="/" />
          )}
        </div>
      </div>

      {/* Client-side content */}
      <ClientHomePage isSignedIn={!!userId} />
    </div>
  );
}