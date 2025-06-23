"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const clerk_middleware_js_1 = require("../middlewares/clerk.middleware.js");
const user_controller_js_1 = require("../controllers/user.controller.js");
const router = express_1.default.Router();
router.post("/sync", clerk_middleware_js_1.clerkAuth, user_controller_js_1.syncClerkUser);
exports.default = router;
