import express from "express";
import {
  uploadPdf,
  getPdfs,
  chatWithPdf,
  getJobStatus,
  deletePdf,
  getChatHistory,
} from "../controllers/pdf.controller";
import { clerkAuth } from "../middlewares/clerk.middleware";
import { upload } from "../utils/multer";

const router = express.Router();

router.post("/upload/pdf", clerkAuth, upload.single("pdf"), uploadPdf);
router.get("/pdfs", clerkAuth, getPdfs);
router.get("/chat", clerkAuth, chatWithPdf);
router.get("/job/:id", getJobStatus);
router.delete("/pdf/:collectionName", clerkAuth, deletePdf);
router.get("/chat/history", clerkAuth, getChatHistory);

export default router;
