import { NextFunction, Request, Response } from "express";
import User from "../models/user.model.js";
import { errorHandler } from "../utils/error.js";

// Sync/Create Clerk user (handles both new and existing users)
export const syncClerkUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { clerkId, email, firstName, lastName } = req.body;

    if (!clerkId || !email) {
      return next(errorHandler(400, res, "Clerk ID and email are required"));
    }

    // Check if user exists
    let user = await User.findOne({ clerkId });

    if (user) {
      // User exists - update their information if needed
      user.email = email;
      // if (firstName !== undefined) user.firstName = firstName;
      // if (lastName !== undefined) user.lastName = lastName;

      await user.save();

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
    user = new User({
      clerkId,
      email,
      firstName: firstName || "",
      lastName: lastName || "",
    });

    await user.save();

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
  } catch (error) {
    console.error("Error syncing user:", error);
    next(errorHandler(500, res, "Server error while syncing user"));
  }
};
