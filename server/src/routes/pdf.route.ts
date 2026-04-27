import express from "express";
import {
  uploadPdf,
  getPdfs,
  chatWithPdf,
  getJobStatus,
  deletePdf,
  getChatHistory,
} from "../controllers/pdf.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { upload } from "../utils/multer";

const router = express.Router();

router.post("/upload/pdf", authMiddleware, upload.single("pdf"), uploadPdf);
router.get("/pdfs", authMiddleware, getPdfs);
router.get("/chat", authMiddleware, chatWithPdf);
router.get("/job/:id", getJobStatus);
router.delete("/pdf/:collectionName", authMiddleware, deletePdf);
router.get("/chat/history", authMiddleware, getChatHistory);

export default router;
