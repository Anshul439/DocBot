"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pdf_controller_1 = require("../controllers/pdf.controller");
const clerk_middleware_1 = require("../middlewares/clerk.middleware");
const multer_1 = require("../utils/multer");
const router = express_1.default.Router();
router.post("/upload/pdf", clerk_middleware_1.clerkAuth, multer_1.upload.single("pdf"), pdf_controller_1.uploadPdf);
router.get("/pdfs", clerk_middleware_1.clerkAuth, pdf_controller_1.getPdfs);
router.get("/chat", clerk_middleware_1.clerkAuth, pdf_controller_1.chatWithPdf);
router.get("/job/:id", pdf_controller_1.getJobStatus);
router.delete("/pdf/:collectionName", clerk_middleware_1.clerkAuth, pdf_controller_1.deletePdf);
router.get("/chat/history", clerk_middleware_1.clerkAuth, pdf_controller_1.getChatHistory);
exports.default = router;
