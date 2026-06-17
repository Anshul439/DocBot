import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import userRoutes from "./routes/user.route.js";
import pdfRoutes from "./routes/pdf.route.js";
import { startPdfUploadWorker } from "./workers/pdfUpload.worker.js";
import { scheduleKeepAlive } from "./cron/keepAlive.cron.js";
import { scheduleGuestCleanup } from "./cron/guestCleanup.cron.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "Server is alive",
    timestamp: new Date().toISOString(),
  });
});

scheduleKeepAlive();
scheduleGuestCleanup();

const PORT = process.env.PORT || 8000;

mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/users", userRoutes);
app.use("/", pdfRoutes);

startPdfUploadWorker();

app.listen(PORT, () => {
  console.log(`Server started on PORT: ${PORT}`);
  console.log("Worker started and listening for jobs...");
});
