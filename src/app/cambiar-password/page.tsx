"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

export default function CambiarPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        setError("Sesión expirada. Inicia sesión de nuevo.");
        router.push("/login");
        return;
      }

      // 1. Cambiar la contraseña en Firebase Auth
      await updatePassword(user, newPassword);

      // 2. Quitar el flag en Firestore
      await updateDoc(doc(db, "users", user.uid), {
        mustChangePassword: false
      });

      // 3. Actualizar el sessionStorage con el flag actualizado
      const storedUser = sessionStorage.getItem("userContext");
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        parsed.mustChangePassword = false;
        sessionStorage.setItem("userContext", JSON.stringify(parsed));
      }

      alert("¡Contraseña actualizada con éxito! Ahora puedes usar tu panel.");
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Error cambiando contraseña:", err);
      if (err.code === "auth/requires-recent-login") {
        setError("Por seguridad, necesitas volver a iniciar sesión antes de cambiar tu contraseña.");
      } else {
        setError(err.message || "Error inesperado al cambiar la contraseña.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #0c1220 0%, #1a2332 50%, #0f1923 100%)"
    }}>
      <div className="glass-panel" style={{
        maxWidth: "460px",
        width: "90%",
        padding: "2.5rem",
        textAlign: "center"
      }}>
        <h1 style={{ color: "#0ea5e9", marginBottom: "0.5rem", fontSize: "1.8rem" }}>🔐 Cambio de Contraseña</h1>
        <p style={{ color: "#94a3b8", marginBottom: "2rem", fontSize: "0.95rem" }}>
          Tu administrador te asignó una contraseña temporal. Por seguridad, debes establecer una contraseña personal antes de continuar.
        </p>

        <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <div style={{ textAlign: "left" }}>
            <label style={{ color: "#cbd5e1", display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>Nueva Contraseña</label>
            <input
              type="password"
              className="input-field"
              placeholder="Mínimo 6 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ textAlign: "left" }}>
            <label style={{ color: "#cbd5e1", display: "block", marginBottom: "0.4rem", fontSize: "0.9rem" }}>Confirmar Contraseña</label>
            <input
              type="password"
              className="input-field"
              placeholder="Repite tu nueva contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>

          {error && (
            <div style={{ padding: "0.8rem", borderRadius: "8px", background: "#fee2e2", color: "#991b1b", fontSize: "0.85rem" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: "100%", padding: "0.9rem", fontSize: "1rem", marginTop: "0.5rem" }}
          >
            {loading ? "Actualizando..." : "Establecer Mi Contraseña"}
          </button>
        </form>
      </div>
    </main>
  );
}
