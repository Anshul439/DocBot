import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // 1. Try JWT auth first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
                userId: string;
                email: string;
            };
            (req as any).userId = decoded.userId;
            (req as any).email = decoded.email;
            (req as any).isGuest = false;
            next();
            return;
        } catch (err) {
            res.status(401).json({ success: false, message: "Invalid or expired token" });
            return;
        }
    }

    // 2. Fall back to guest session ID
    const guestId = req.headers["x-guest-id"] as string | undefined;
    if (guestId && guestId.startsWith("guest_")) {
        (req as any).userId = guestId;
        (req as any).isGuest = true;
        next();
        return;
    }

    res.status(401).json({ success: false, message: "No authentication provided" });
};
