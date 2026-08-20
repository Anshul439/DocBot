import express from "express";
import { signup, signin, getMe } from "../controllers/user.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = express.Router();

router.post("/signup", authLimiter, signup);
router.post("/signin", authLimiter, signin);
router.get("/me", authMiddleware, getMe);

export default router;
