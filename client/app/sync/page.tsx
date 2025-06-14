"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SyncPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");

  useEffect(() => {
    const handleUserSync = async () => {
      try {
        setError(null);

        // Wait for authentication to fully load
        if (!userLoaded || !authLoaded) {
          setLoadingMessage("Loading authentication...");
          return;
        }

        // Check if user has required data
        if (!user?.id || !user.emailAddresses?.[0]?.emailAddress) {
          setLoadingMessage("Loading user data...");
          return;
        }

        setLoadingMessage("Syncing user data...");
        console.log("Processing user:", user);

        const token = await getToken();

        if (!token) {
          throw new Error("Authentication token not available");
        }

        setLoadingMessage("Checking user status...");
        const checkUserRes = await fetch(
          `http://localhost:8000/api/users/check/${user.id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!checkUserRes.ok && checkUserRes.status !== 404) {
          const errorData = await checkUserRes.text();
          throw new Error(
            `Error checking user existence (${checkUserRes.status}): ${errorData}`
          );
        }

        const userExists = checkUserRes.status === 200;

        if (userExists) {
          setLoadingMessage("User found, redirecting...");
          setTimeout(() => router.push("/"), 500);
          return;
        }

        setLoadingMessage("Creating user profile...");
        const syncRes = await fetch("http://localhost:8000/api/users/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            clerkId: user.id,
            email: user.emailAddresses[0].emailAddress,
            firstName: user.firstName || "",
            lastName: user.lastName || "",
          }),
        });

        if (!syncRes.ok) {
          const errorData = await syncRes.text();
          throw new Error(
            `Server error during sync (${syncRes.status}): ${errorData}`
          );
        }

        const syncData = await syncRes.json();
        console.log("User sync successful:", syncData);

        setLoadingMessage("Setup complete, redirecting...");
        setTimeout(() => router.push("/"), 1500);
      } catch (err) {
        console.error("Error during user sync process:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
        setIsLoading(false);
      }
    };

    handleUserSync();
  }, [user, userLoaded, authLoaded, getToken, router]);

  // Show error state
  // if (error) {
  //   return (
  //     <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
  //       <div className="text-center max-w-md">
  //         <div className="text-red-500 text-xl mb-4">⚠️ Error</div>
  //         <p className="text-gray-700 mb-4">{error}</p>
  //         <button
  //           onClick={() => window.location.reload()}
  //           className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
  //         >
  //           Retry
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }

  // Show continuous loading state
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
      </div>
    </div>
  );
}