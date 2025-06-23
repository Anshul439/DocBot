"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SyncPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const router = useRouter();
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");

  useEffect(() => {
    const handleUserSync = async () => {
      try {
        if (!userLoaded || !authLoaded) {
          setLoadingMessage("Loading authentication...");
          return;
        }

        if (!user?.id || !user.emailAddresses?.[0]?.emailAddress) {
          setLoadingMessage("Loading user data...");
          return;
        }

        setLoadingMessage("Syncing user data...");
        const token = await getToken();

        if (!token) {
          throw new Error("Authentication token not available");
        }

        const syncRes = await fetch(`${process.env.NEXT_PUBLIC_ROOT_URL}/api/users/sync`, {
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
          throw new Error(`Sync failed (${syncRes.status}): ${errorData}`);
        }

        setLoadingMessage("Redirecting...");
        setTimeout(() => router.push("/"), 500);
      } catch (err) {
        console.error("Error during user sync:", err);
        setLoadingMessage("Error occurred - redirecting...");
        setTimeout(() => router.push("/"), 1500);
      }
    };

    handleUserSync();
  }, [user, userLoaded, authLoaded, getToken, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-700">{loadingMessage}</p>
      </div>
    </div>
  );
}