import fs from "fs";
import cron from "node-cron";
import PDFMetadata from "../models/pdf.model";
import ChatMessage from "../models/chat.model";
import { qdrantClient } from "../config/qdrant";
import { GUEST_TTL_HOURS } from "../config/rag.constants";

export function scheduleGuestCleanup(): void {
  cron.schedule("0 3 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - GUEST_TTL_HOURS * 60 * 60 * 1000);
      const expiredGuestPdfs = await PDFMetadata.find({
        userId: { $regex: /^guest_/ },
        uploadTime: { $lt: cutoff },
      });

      for (const pdf of expiredGuestPdfs) {
        try {
          await qdrantClient.deleteCollection(pdf.collectionName);
        } catch {
          // collection may already be gone
        }

        if (pdf.filePath && fs.existsSync(pdf.filePath)) {
          fs.unlinkSync(pdf.filePath);
        }

        await PDFMetadata.deleteOne({ _id: pdf._id });
      }

      await ChatMessage.deleteMany({
        userId: { $regex: /^guest_/ },
        timestamp: { $lt: cutoff },
      });

      if (expiredGuestPdfs.length > 0) {
        console.log(
          `Guest cleanup: removed ${expiredGuestPdfs.length} expired PDF(s)`
        );
      }
    } catch (err) {
      console.error("Guest cleanup error:", err);
    }
  });
}
