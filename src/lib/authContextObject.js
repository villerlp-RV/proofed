import { createContext } from "react";

// Extracted to its own module so Vite HMR doesn't create a duplicate context
// object when AuthContext.jsx is hot-reloaded (same fix as householdContext.js).
export const AuthContext = createContext(undefined);
