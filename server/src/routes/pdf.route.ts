import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
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

function handleMulterError(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ success: false, error: "File is too large. Maximum size is 20 MB." });
      return;
    }
    res.status(400).json({ success: false, error: err.message });
    return;
  }
  if (err?.message === "Only PDF files are allowed") {
    res.status(400).json({ success: false, error: "Only PDF files are allowed." });
    return;
  }
  next(err);
}

router.post(
  "/upload/pdf",
  uploadLimiter,
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) =>
    upload.single("pdf")(req, res, (err) => handleMulterError(err, req, res, next)),
  uploadPdf
);
router.get("/pdfs", generalLimiter, authMiddleware, getPdfs);
router.get("/chat", chatLimiter, authMiddleware, chatWithPdf);
router.get("/job/:id", generalLimiter, getJobStatus);
router.delete("/pdf/:collectionName", generalLimiter, authMiddleware, deletePdf);
router.get("/chat/history", generalLimiter, authMiddleware, getChatHistory);

export default router;
