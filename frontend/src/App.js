import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
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
