import { useState } from "react";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { Fish, X } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Same aqua palette as App.jsx
const colors = {
    aqua: "#00A8D6",
    aquaDark: "#0077B6",
};

// Shared Tailwind classes so every field looks identical
const inputClass =
    "w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100";
const labelClass = "mb-1.5 block text-sm font-semibold text-brand-900";
const buttonClass =
    "am-sheen w-full rounded-full py-3.5 font-bold text-white shadow-lg shadow-brand-500/30 transition hover:scale-[1.02] hover:opacity-95 active:scale-95 disabled:opacity-60 disabled:hover:scale-100";
const buttonStyle = {
    backgroundImage: `linear-gradient(90deg, ${colors.aqua}, ${colors.aquaDark})`,
};
export default function AuthModal({ onClose, onLogin }) {
    const [mode, setMode] = useState("login");

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Talks to the backend. On success it hands the token and user
    // straight to the parent (App.jsx). No address step any more.
    async function authenticate(url, body) {
        setError("");
        setLoading(true);

        try {
            const response = await fetch(`${API_URL}${url}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Authentication failed.");
            }

            onLogin({ token: data.token, user: data.user });
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot reach the server. Check that your backend is running."
                    : err.message || "Something went wrong."
            );
        } finally {
            setLoading(false);
        }
    }

    function handleAccountSubmit(e) {
        e.preventDefault();

        if (mode === "register") {
            return authenticate("/api/customers/register", {
                name: name.trim(),
                email: email.trim(),
                password,
            });
        }

        return authenticate("/api/customers/login", {
            email: email.trim(),
            password,
        });
    }

    async function handleGoogleSuccess(credentialResponse) {
        if (!credentialResponse.credential) {
            setError("Google did not return a sign-in credential.");
            return;
        }

        await authenticate("/api/customers/google", {
            credential: credentialResponse.credential,
        });
    }

    return (
        <GoogleOAuthProvider
            clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}
        >
            {/* Animation CSS lives here so this component works on its own */}
            <style>{`
                @keyframes amFade { from { opacity:0; } to { opacity:1; } }
                @keyframes amPopIn { from { opacity:0; transform:translateY(30px) scale(.94); } to { opacity:1; transform:none; } }
                @keyframes amRise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
                @keyframes amDrop { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:none; } }
                @keyframes amShake { 0%,100% { transform:translateX(0); } 20%,60% { transform:translateX(-6px); } 40%,80% { transform:translateX(6px); } }
                @keyframes amBob { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-3px) rotate(-8deg); } }
                @keyframes amBubble { 0%,100% { transform:translateY(0) scale(1); opacity:.5; } 50% { transform:translateY(-14px) scale(1.1); opacity:.9; } }
                @keyframes amSheen { 0% { transform:translateX(-120%) skewX(-20deg); } 60%,100% { transform:translateX(320%) skewX(-20deg); } }
                @keyframes amSpin { to { transform:rotate(360deg); } }
                .am-overlay { animation: amFade .3s ease-out; }
                .am-card { animation: amPopIn .45s cubic-bezier(.2,.8,.2,1); }
                .am-rise { animation: amRise .5s cubic-bezier(.2,.8,.2,1) both; }
                .am-bad { animation: amDrop .35s ease-out, amShake .45s .1s ease-in-out; }
                .am-bob { animation: amBob 3s ease-in-out infinite; }
                .am-bubble { animation: amBubble 5s ease-in-out infinite; }
                .am-spin { animation: amSpin .8s linear infinite; }
                .am-sheen { position:relative; overflow:hidden; }
                .am-sheen::after { content:""; position:absolute; top:0; bottom:0; width:40%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent); animation: amSheen 3.2s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) { .am-overlay,.am-card,.am-rise,.am-bad,.am-bob,.am-bubble,.am-spin,.am-sheen::after { animation:none !important; } }
            `}</style>

           <div className="am-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-brand-900/60 p-4 backdrop-blur-sm">
    <div className="am-card relative my-auto w-full max-w-md overflow-hidden rounded-[2rem] bg-white p-8 shadow-2xl">
                    {/* Aqua top strip and floating bubbles */}
                    <div
                        className="absolute inset-x-0 top-0 h-1.5"
                        style={{
                            backgroundImage: `linear-gradient(90deg, ${colors.aquaDark}, ${colors.aqua}, #5EEAD4)`,
                        }}
                    />
                    <span className="am-bubble pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-100/70" />
                    <span
                        className="am-bubble pointer-events-none absolute right-20 top-12 h-8 w-8 rounded-full bg-cyan-200/60"
                        style={{ animationDelay: "1.5s" }}
                    />

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close login"
                        className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-slate-500 transition duration-300 hover:rotate-90 hover:bg-cyan-50 hover:text-slate-900"
                    >
                        <X size={22} />
                    </button>

                    <div className="relative flex items-center gap-2">
                        <span
                            className="am-bob flex h-9 w-9 items-center justify-center rounded-xl text-white"
                            style={{ backgroundColor: colors.aqua }}
                        >
                            <Fish size={20} />
                        </span>
                        <p
                            className="text-sm font-semibold tracking-widest"
                            style={{ color: colors.aquaDark }}
                        >
                            VARDAN AQUA FOODS
                        </p>
                    </div>

                    <div className="relative">
                       <h2 className="mt-5 font-display text-3xl font-extrabold text-brand-900">
                            {mode === "register"
                                ? "Create your account"
                                : "Welcome to our store"}
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-slate-500">
    Sign in to order fresh seafood and continue shopping.
</p>

                        {/* Log in / Register switch with a sliding pill */}
                        <div className="relative mt-5 grid grid-cols-2 rounded-full bg-brand-50 p-1">
                            <span
                                className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-white shadow transition-transform duration-300 ease-out"
                                style={{
                                    transform:
                                        mode === "login"
                                            ? "translateX(0)"
                                            : "translateX(100%)",
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("login");
                                    setError("");
                                }}
                                className="relative z-10 rounded-full py-2 text-sm font-semibold transition-colors"
                                style={{
                                    color:
                                        mode === "login"
                                            ? colors.aquaDark
                                            : "#475569",
                                }}
                            >
                                Log in
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setMode("register");
                                    setError("");
                                }}
                                className="relative z-10 rounded-full py-2 text-sm font-semibold transition-colors"
                                style={{
                                    color:
                                        mode === "register"
                                            ? colors.aquaDark
                                            : "#475569",
                                }}
                            >
                                Register
                            </button>
                        </div>

                        <form
                            onSubmit={handleAccountSubmit}
                            className="mt-5 space-y-4"
                        >
                            {mode === "register" && (
                                <div className="am-rise">
                                    <label className={labelClass}>
                                        Full name
                                    </label>
                                    <input
                                        type="text"
                                        autoComplete="name"
                                        maxLength={80}
                                        value={name}
                                        onChange={(e) =>
                                            setName(e.target.value)
                                        }
                                        placeholder="Enter your full name"
                                        required
                                        className={inputClass}
                                    />
                                </div>
                            )}

                            <div className="am-rise" style={{ animationDelay: "60ms" }}>
                                <label className={labelClass}>
                                    Email address
                                </label>
                                <input
                                    type="email"
                                    autoComplete="email"
                                    maxLength={254}
                                    value={email}
                                    onChange={(e) =>
                                        setEmail(e.target.value)
                                    }
                                    placeholder="you@example.com"
                                    required
                                    className={inputClass}
                                />
                            </div>

                            <div className="am-rise" style={{ animationDelay: "120ms" }}>
                                <label className={labelClass}>
                                    Password
                                </label>
                                <input
                                    type="password"
                                    autoComplete={
                                        mode === "register"
                                            ? "new-password"
                                            : "current-password"
                                    }
                                    minLength={8}
                                    maxLength={128}
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    placeholder="At least 8 characters"
                                    required
                                    className={inputClass}
                                />
                            </div>

                            <button
                                disabled={loading}
                                className={`${buttonClass} am-rise flex items-center justify-center gap-2`}
                                style={{ ...buttonStyle, animationDelay: "180ms" }}
                            >
                                {loading && (
                                    <span className="am-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
                                )}
                                {loading
                                    ? "Please wait..."
                                    : mode === "register"
                                        ? "Create account"
                                        : "Log in"}
                            </button>
                        </form>

                        <div className="my-5 flex items-center gap-3">
                            <div className="h-px flex-1 bg-slate-200" />
                            <span className="text-xs text-slate-500">
                                OR
                            </span>
                            <div className="h-px flex-1 bg-slate-200" />
                        </div>

                        <div className="am-rise flex justify-center" style={{ animationDelay: "240ms" }}>
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={() =>
                                    setError("Google sign-in was unsuccessful.")
                                }
                                useOneTap={false}
                            />
                        </div>
                    </div>

                    {error && (
                        <p
                            key={error}
                            role="alert"
                            className="am-bad mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600"
                        >
                            {error}
                        </p>
                    )}

                    <p className="mt-6 text-center text-xs text-slate-500">
                        Your account is authenticated by our backend.
                    </p>
                </div>
            </div>
        </GoogleOAuthProvider>
    );
}