import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { errorHandler } from "../utils/error.js";

export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return next(errorHandler(400, res, "Name, email and password are required"));
    }

    if (password.length < 6) {
      return next(errorHandler(400, res, "Password must be at least 6 characters"));
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return next(errorHandler(409, res, "Email already in use"));
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      email: email.toLowerCase(),
      name,
      password: hashedPassword,
    });

    await user.save();

    const token = jwt.sign(
      { userId: (user._id as any).toString(), email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    next(errorHandler(500, res, "Server error during signup"));
  }
};

export const signin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(errorHandler(400, res, "Email and password are required"));
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return next(errorHandler(401, res, "Invalid email or password"));
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return next(errorHandler(401, res, "Invalid email or password"));
    }

    const token = jwt.sign(
      { userId: (user._id as any).toString(), email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Signed in successfully",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Signin error:", error);
    next(errorHandler(500, res, "Server error during signin"));
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return next(errorHandler(404, res, "User not found"));
    }
    res.json({ success: true, user });
  } catch (error) {
    next(errorHandler(500, res, "Server error"));
  }
};
