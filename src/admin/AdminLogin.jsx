import { useState } from "react";
import { Eye, EyeOff, Fish, LockKeyhole, UserRound } from "lucide-react";

// Same backend address setting as the customer site.
// Set VITE_API_URL in the root .env when you deploy.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Same aqua palette as the customer site.
const colors = {
    aqua: "#00A8D6",
    aquaDark: "#0077B6",
};

// AdminDashboard gives this component an onLogin function.
// When the login succeeds, we call onLogin(token) and the dashboard takes over.
export default function AdminLogin({ onLogin }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();

        // Ignore a second click while the first request is still running.
        if (loading) return;

        setLoading(true);
        setError("");

        try {
            const response = await fetch(`${API_URL}/api/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username.trim(), password }),
            });

            // If the server sends something that is not JSON, don't crash.
            let data = {};

            try {
                data = await response.json();
            } catch {
                data = {};
            }

            if (!response.ok || !data.success || !data.token) {
                throw new Error(
                    response.status === 429
                        ? "Too many attempts. Please wait a few minutes and try again."
                        : data.message || "Login failed."
                );
            }

            // Don't keep the password in memory after a successful login.
            setPassword("");
            onLogin(data.token);
        } catch (err) {
            // fetch() throws a TypeError when the server cannot be reached.
            setError(
                err instanceof TypeError
                    ? "Unable to connect to the server. Check that the backend is running."
                    : err.message || "Login failed."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <main
            className="flex min-h-screen items-center justify-center px-4 py-10"
            style={{ background: "linear-gradient(180deg,#f2fbfe 0%,#edfaff 100%)" }}
        >
            <div className="w-full max-w-md rounded-3xl border border-sky-100 bg-white p-8 shadow-xl shadow-cyan-100/60 sm:p-10">
                <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg shadow-cyan-200"
                    style={{
                        backgroundImage: `linear-gradient(135deg, ${colors.aqua}, ${colors.aquaDark})`,
                    }}
                >
                    <Fish size={32} />
                </div>

                <div className="mt-6 text-center">
                    <p className="text-sm font-extrabold tracking-widest text-slate-900">
                        VARDAN AQUA FOODS
                    </p>
                    <h1 className="mt-3 text-2xl font-extrabold text-slate-900">
                        Admin sign in
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        Sign in to manage orders and store inventory.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    <div>
                        <label
                            htmlFor="admin-username"
                            className="mb-2 block text-sm font-semibold text-slate-700"
                        >
                            Admin username
                        </label>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-100">
                            <UserRound size={18} className="shrink-0 text-slate-400" />
                            <input
                                id="admin-username"
                                required
                                autoComplete="username"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder="Enter username"
                                className="w-full bg-transparent py-3 text-sm outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="admin-password"
                            className="mb-2 block text-sm font-semibold text-slate-700"
                        >
                            Password
                        </label>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-100">
                            <LockKeyhole size={18} className="shrink-0 text-slate-400" />
                            <input
                                id="admin-password"
                                required
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="Enter password"
                                className="w-full bg-transparent py-3 text-sm outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((current) => !current)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-700"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <p
                            role="alert"
                            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
                        >
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                            backgroundImage: `linear-gradient(90deg, ${colors.aqua}, ${colors.aquaDark})`,
                        }}
                    >
                        {loading ? "Signing in..." : "Sign in securely"}
                    </button>
                </form>

                <p className="mt-6 text-center text-xs text-slate-400">
                    Authorized store administrators only
                </p>
            </div>
        </main>
    );
}