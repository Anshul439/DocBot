"use client";

import { useEffect } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SyncPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const handleUserSync = async () => {
      try {
        if (!userLoaded || !authLoaded) {
          // console.log("Loading authentication...");
          return;
        }

        if (!user?.id || !user.emailAddresses?.[0]?.emailAddress) {
          // console.log("Loading user data...");
          return;
        }

        // console.log("Syncing user data...");

        const token = await getToken();

        if (!token) {
          throw new Error("Authentication token not available");
        }

        const syncRes = await fetch(
          `${process.env.NEXT_PUBLIC_ROOT_URL}/api/users/sync`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              clerkId: user.id,
              email: user.emailAddresses[0].emailAddress,
              name: user.fullName
            }),
          }
        );

        if (!syncRes.ok) {
          const errorData = await syncRes.text();
          throw new Error(`Sync failed (${syncRes.status}): ${errorData}`);
        }

        // Wait for the response to complete before redirecting
        // const result = await syncRes.json();
        // console.log("Sync completed:", result);
        // console.log("Redirecting...");

        // Redirect after successful sync
        setTimeout(() => router.push("/"), 500);
      } catch (err) {
        // console.error("Error during user sync:", err);
        // console.log("Error occurred - redirecting...");

        // Still redirect on error, but with a longer delay
        setTimeout(() => router.push("/"), 1500);
      }
    };

    handleUserSync();
  }, [user, userLoaded, authLoaded, getToken, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#000000f7]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        {/* <p className="text-white mt-4">Syncing your account...</p> */}
      </div>
    </div>
  );
}