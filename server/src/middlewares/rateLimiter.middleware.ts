import rateLimit from "express-rate-limit";

const json429 = (message: string) => ({
  handler: (_req: any, res: any) => {
    res.status(429).json({ success: false, error: message });
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...json429("Too many auth attempts. Please try again in 15 minutes."),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  ...json429("Upload limit reached. Please wait before uploading more PDFs."),
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  ...json429("Sending too fast. Please slow down."),
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  ...json429("Too many requests. Please slow down."),
});
