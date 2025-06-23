"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncClerkUser = void 0;
const user_model_js_1 = __importDefault(require("../models/user.model.js"));
const error_js_1 = require("../utils/error.js");
// Sync/Create Clerk user (handles both new and existing users)
const syncClerkUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { clerkId, email, firstName, lastName } = req.body;
        if (!clerkId || !email) {
            return next((0, error_js_1.errorHandler)(400, res, "Clerk ID and email are required"));
        }
        // Check if user exists
        let user = yield user_model_js_1.default.findOne({ clerkId });
        if (user) {
            // User exists - update their information if needed
            user.email = email;
            // if (firstName !== undefined) user.firstName = firstName;
            // if (lastName !== undefined) user.lastName = lastName;
            yield user.save();
            res.status(200).json({
                success: true,
                message: "User updated successfully",
                user: {
                    id: user._id,
                    clerkId: user.clerkId,
                    email: user.email,
                    // firstName: user.firstName || "",
                    // lastName: user.lastName || "",
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                },
            });
            return;
        }
        // Create new user
        user = new user_model_js_1.default({
            clerkId,
            email,
            firstName: firstName || "",
            lastName: lastName || "",
        });
        yield user.save();
        res.status(201).json({
            success: true,
            message: "User created successfully",
            user: {
                id: user._id,
                clerkId: user.clerkId,
                email: user.email,
                // firstName: user.firstName || "",
                // lastName: user.lastName || "",
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
        });
    }
    catch (error) {
        console.error("Error syncing user:", error);
        next((0, error_js_1.errorHandler)(500, res, "Server error while syncing user"));
    }
});
exports.syncClerkUser = syncClerkUser;
