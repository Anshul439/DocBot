import multer, { FileFilterCallback } from "multer";
import fs from "fs";
import { Request } from "express";
import { MAX_UPLOAD_SIZE_BYTES } from "../config/rag.constants";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = "uploads/";
    if (!fs.existsSync(uploadsDir))
      fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  },
});

function pdfFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"));
  }
}

export const upload = multer({
  storage,
  fileFilter: pdfFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});