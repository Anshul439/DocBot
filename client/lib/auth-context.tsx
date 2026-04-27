"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    ReactNode,
} from "react";

interface User {
    id: string;
    email: string;
    name: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isSignedIn: boolean;
    isLoaded: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, name: string) => Promise<void>;
    signOut: () => void;
    getToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const storedToken = localStorage.getItem("auth_token");
        const storedUser = localStorage.getItem("auth_user");
        if (storedToken && storedUser) {
            try {
                setToken(storedToken);
                setUser(JSON.parse(storedUser));
            } catch {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("auth_user");
            }
        }
        setIsLoaded(true);
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_ROOT_URL}/api/users/signin`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            }
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || "Sign in failed");
        }
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
    }, []);

    const signUp = useCallback(
        async (email: string, password: string, name: string) => {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_ROOT_URL}/api/users/signup`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, name }),
                }
            );
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Sign up failed");
            }
            localStorage.setItem("auth_token", data.token);
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            setToken(data.token);
            setUser(data.user);
        },
        []
    );

    const signOut = useCallback(() => {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        setToken(null);
        setUser(null);
    }, []);

    const getToken = useCallback(() => {
        return localStorage.getItem("auth_token");
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isSignedIn: !!user && !!token,
                isLoaded,
                signIn,
                signUp,
                signOut,
                getToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
