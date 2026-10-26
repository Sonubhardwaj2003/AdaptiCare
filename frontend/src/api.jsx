import { createContext, useContext, useEffect, useState, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function api(path, { method = "GET", body } = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  }).catch(() => { throw new Error("Cannot reach the server. Check that the backend is running."); });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Loads data from the API. Call reload() after a change.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api(path).then((data) => live && setState({ data, error: "", loading: false }))
      .catch((e) => live && setState({ data: null, error: e.message, loading: false }));
    return () => { live = false; };
  }, [path, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem("token")) return setReady(true);
    api("/auth/me").then(setUser).catch(() => localStorage.removeItem("token")).finally(() => setReady(true));
  }, []);
  const login = async (email, password) => {
    const { token, user } = await api("/auth/login", { method: "POST", body: { email, password } });
    localStorage.setItem("token", token); setUser(user);
  };
  const logout = () => { localStorage.removeItem("token"); setUser(null); };
  return <AuthCtx.Provider value={{ user, ready, login, logout, updateUser: setUser }}>{children}</AuthCtx.Provider>;
}

export const minutes = (s) => `${(s / 60).toFixed(1)} min`;

// Explains where an alarm fell relative to the seizure onset.
// `lead` (optional) is the time to the next seizure onset measured by the ML pipeline, which may be in the next file.
export function describeAlarm(t, onset, lead) {
  const given = lead !== undefined;
  const l = given ? lead : onset == null ? null : onset - t;
  if (l == null) return { text: given ? "No seizure followed (false alarm)" : "No seizure in this recording (false alarm)", tone: "bad" };
  if (l < 0) return { text: "After seizure onset", tone: "bad" };
  if (l < 300) return { text: `${minutes(l)} before onset (too late to act)`, tone: "warn" };
  if (l <= 2100) return { text: `${minutes(l)} before onset (correct warning)`, tone: "good" };
  if (l <= 3900) return { text: `${minutes(l)} before onset (earlier than scored window)`, tone: "warn" };
  return { text: `${minutes(l)} before onset (too early)`, tone: "bad" };
}
