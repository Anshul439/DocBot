"use client";

import { useState, useEffect } from "react";
import { X, Mail, Lock, User, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface AuthModalProps {
    onClose: () => void;
    defaultMode?: "signin" | "signup";
}

export default function AuthModal({
    onClose,
    defaultMode = "signin",
}: AuthModalProps) {
    const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const { signIn, signUp } = useAuth();

    useEffect(() => {
        const t = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(t);
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(onClose, 300);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            if (mode === "signup") {
                await signUp(email, password, name);
            } else {
                await signIn(email, password);
            }
            handleClose();
        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => {
        setMode((m) => (m === "signin" ? "signup" : "signin"));
        setError("");
        setName("");
        setEmail("");
        setPassword("");
    };

    return (
        <div
            className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ${isVisible ? "bg-black/70 opacity-100" : "bg-black/0 opacity-0"
                }`}
            onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
            <div
                className={`relative bg-[#111111] border border-gray-800 rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl transition-all duration-300 ${isVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                    }`}
            >
                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="mb-7">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-4">
                        <User size={18} className="text-indigo-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">
                        {mode === "signin" ? "Welcome back" : "Create account"}
                    </h2>
                    <p className="text-gray-500 text-sm">
                        {mode === "signin"
                            ? "Sign in to your DocBot account"
                            : "Start chatting with your PDFs"}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === "signup" && (
                        <div className="relative">
                            <User
                                size={15}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                            />
                            <input
                                id="auth-name"
                                type="text"
                                placeholder="Full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                autoComplete="name"
                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg pl-9 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    )}

                    <div className="relative">
                        <Mail
                            size={15}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                        />
                        <input
                            id="auth-email"
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg pl-9 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>

                    <div className="relative">
                        <Lock
                            size={15}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                        />
                        <input
                            id="auth-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete={
                                mode === "signup" ? "new-password" : "current-password"
                            }
                            minLength={6}
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg pl-9 pr-10 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}

                    <button
                        id="auth-submit-btn"
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 mt-2"
                    >
                        {loading && <Loader2 size={15} className="animate-spin" />}
                        {mode === "signin" ? "Sign In" : "Create Account"}
                    </button>
                </form>

                {/* Switch Mode */}
                <p className="text-center text-gray-500 text-sm mt-5">
                    {mode === "signin" ? "No account?" : "Already have an account?"}{" "}
                    <button
                        onClick={switchMode}
                        className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                        {mode === "signin" ? "Sign up" : "Sign in"}
                    </button>
                </p>
            </div>
        </div>
    );
}
