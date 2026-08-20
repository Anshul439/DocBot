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
import {
  uploadLimiter,
  chatLimiter,
  generalLimiter,
} from "../middlewares/rateLimiter.middleware.js";

const router = express.Router();

router.post("/upload/pdf", uploadLimiter, authMiddleware, upload.single("pdf"), uploadPdf);
router.get("/pdfs", generalLimiter, authMiddleware, getPdfs);
router.get("/chat", chatLimiter, authMiddleware, chatWithPdf);
router.get("/job/:id", generalLimiter, getJobStatus);
router.delete("/pdf/:collectionName", generalLimiter, authMiddleware, deletePdf);
router.get("/chat/history", generalLimiter, authMiddleware, getChatHistory);

export default router;
