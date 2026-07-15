import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import AuthCallback from "@/components/AuthCallback";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";

/**
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 * AuthCallback wraps the app to synchronously detect the #session_id= URL fragment
 * returned by Emergent OAuth and exchange it for our own session cookie BEFORE
 * the rest of the app tries to call /api/auth/me.
 */
function App() {
  return (
    <AuthProvider>
      <div className="App">
        <BrowserRouter>
          <AuthCallback>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </AuthCallback>
        </BrowserRouter>
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "#0c0c0e",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#f8f8f8",
              fontFamily: "Outfit, sans-serif",
            },
          }}
        />
      </div>
    </AuthProvider>
  );
}

export default App;
