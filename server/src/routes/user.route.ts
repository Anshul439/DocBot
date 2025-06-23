import express from "express";
import { clerkAuth } from "../middlewares/clerk.middleware.js";
import { syncClerkUser } from "../controllers/user.controller.js";

const router = express.Router();

router.post("/sync", clerkAuth, syncClerkUser);

export default router;
