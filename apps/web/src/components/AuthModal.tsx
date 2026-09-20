import React, { useState } from "react";
import { LogIn, UserPlus, Sparkles, AlertCircle } from "lucide-react";
import type { AuthState } from "../types";

interface AuthModalProps {
  onSuccess: (auth: AuthState) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instant Guest Login for frictionless testing!
  const handleQuickGuest = async () => {
    setLoading(true);
    setError(null);
    const guestId = Math.floor(1000 + Math.random() * 9000);
    const guestEmail = `guest_${guestId}@ludo.play`;
    const guestName = `Player_${guestId}`;
    const guestPass = "Pass@123";

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: guestEmail,
          username: guestName,
          password: guestPass,
        }),
      });
      const data = await res.json();
      if (data.token) {
        onSuccess({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user || { id: "", name: guestName, email: guestEmail },
        });
      } else {
        setError(typeof data === "string" ? data : "Signup failed. Please retry.");
      }
    } catch (err) {
      setError("Server connection failed. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = mode === "signup" ? "/api/signup" : "/api/signin";
    const payload =
      mode === "signup"
        ? { email, username, password }
        : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.token) {
        onSuccess({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user || { id: "", name: username || email.split("@")[0]!, email },
        });
      } else {
        setError(typeof data === "string" ? data : "Authentication failed");
      }
    } catch (err) {
      setError("Network request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon-badge">
            <Sparkles size={28} color="#ffffff" />
          </div>
          <h2 className="auth-title">Join Ludo Arena</h2>
          <p className="auth-subtitle">Real-Time Multiplayer with Friends</p>
        </div>

        {/* Quick Instant Play Button */}
        <button
          onClick={handleQuickGuest}
          disabled={loading}
          className="btn btn-primary"
          style={{ marginBottom: "1rem" }}
        >
          <Sparkles size={18} /> Quick Instant Play (1-Click)
        </button>

        <div className="divider">
          <div className="divider-line" />
          <span className="divider-text">Or Use Account</span>
          <div className="divider-line" />
        </div>

        {error && (
          <div className="alert-box">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="form-group">
              <label className="form-label">Your Name</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ashutosh"
                className="form-input"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="player@example.com"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="form-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem" }}
          >
            {mode === "signup" ? (
              <>
                <UserPlus size={18} /> Create Account
              </>
            ) : (
              <>
                <LogIn size={18} /> Sign In
              </>
            )}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
          className="btn-link"
        >
          {mode === "signup"
            ? "Already have an account? Sign In"
            : "Don't have an account? Sign Up"}
        </button>
      </div>
    </div>
  );
};
