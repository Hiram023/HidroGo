  "use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

import { dbService } from "../../services/dbReal";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Usando Firebase Auth
      const user = await dbService.authenticate(email, password);
      
      if (user) {
        if (user.role === "SUPER_ADMIN") {
          router.push("/admin");
        } else if (user.role === "CLIENT") {
          sessionStorage.setItem("userContext", JSON.stringify(user));
          // Si tiene flag de cambio obligatorio, redirigir a cambiar contraseña
          if (user.mustChangePassword) {
            router.push("/cambiar-password");
          } else {
            router.push("/dashboard");
          }
        }
      } else {
        setError("Usuario o contraseña incorrectos.");
      }
    } catch (err) {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      {/* Background shapes */}
      <div className={styles.shape1}></div>
      <div className={styles.shape2}></div>

      <div className={`glass-panel ${styles.loginCard}`}>
        <div className={styles.header}>
          <h1>RiegoSon</h1>
        </div>

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">Correo Electrónico</label>
            <input
              id="email"
              type="email"
              className="input-field"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            className={`btn-primary ${styles.submitBtn}`}
            disabled={loading}
          >
            {loading ? "Iniciando..." : "Iniciar Sesión"}
          </button>
        </form>
      </div>
    </main>
  );
}
