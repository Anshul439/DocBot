import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { startPdfUploadWorker } from "./workers/pdfUpload.worker";

mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => {
    console.log("MongoDB connected");
    startPdfUploadWorker();
    console.log("PDF upload worker started (standalone mode)");
  })
  .catch((err) => console.error("MongoDB connection error:", err));
