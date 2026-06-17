import cron from "node-cron";

async function pingHealth(): Promise<void> {
  const url = process.env.RENDER_URL;
  if (!url) return;

  try {
    const response = await fetch(`${url}/health`);
    if (response.ok) {
      console.log(`Keep-alive ping successful at ${new Date().toISOString()}`);
    } else {
      console.log(`Keep-alive ping failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error("Keep-alive ping error:", error);
  }
}

export function scheduleKeepAlive(): void {
  cron.schedule("*/14 * * * *", () => {
    console.log("Running keep-alive cron job...");
    pingHealth();
  });
}
