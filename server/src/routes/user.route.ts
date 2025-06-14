import express from "express";
import { clerkAuth } from "../middlewares/clerk.middleware.js";
import { checkUserExists, syncClerkUser } from "../controllers/user.controller.js";

const router = express.Router();

router.post("/sync", clerkAuth, syncClerkUser);
router.get("/check/:clerkId", checkUserExists);

export default router;
