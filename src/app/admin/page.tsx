"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";
import { dbService } from "../../services/dbReal";

type Client = {
  id: string;
  name: string;
  email: string;
  devEui?: string;
  valves?: number;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", devEui: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{text: string, type: "error" | "success"} | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await dbService.getAllClients();
      setClients(data as Client[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await dbService.signOut();
    router.push("/login");
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const result = await dbService.createClientUser(newClient.name, newClient.email, newClient.devEui);

    if (result.success) {
      setMessage({ text: `Exito. Contraseña temporal cliente: ${result.tempPassword}`, type: "success" });
      setNewClient({ name: "", email: "", devEui: "" });
      setShowForm(false);
      loadClients(); // Refrescar tabla
      alert(`Cliente Registrado\nCorreo: ${newClient.email}\nContraseña Temporal: ${result.tempPassword}`);
    } else {
      setMessage({ text: `Error: ${result.error}`, type: "error" });
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className={styles.adminLayout}>
      {/* Sidebar Decorativa */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h2>HidroGo</h2>
          <span>Super Admin</span>
        </div>
        <nav className={styles.nav}>
          <a href="#" className={styles.active}>Gestión de Clientes</a>
          <a href="#">Reportes de Red (TTN)</a>
          <a href="#">Configuración Global</a>
        </nav>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Cerrar Sesión
        </button>
      </aside>

      {/* Contenido Principal */}
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <h1>Panel de Clientes</h1>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancelar" : "+ Nuevo Cliente"}
          </button>
        </header>

        {showForm && (
          <div className={`glass-panel ${styles.formContainer}`}>
            <h2>Alta de Nuevo Cliente</h2>
            <form onSubmit={handleAddClient} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Nombre de la Agrícola / Rancho</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newClient.name}
                  onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                  required 
                />
              </div>
              <div className={styles.formGroup}>
                <label>Correo Electrónico</label>
                <input 
                  type="email" 
                  className="input-field" 
                  value={newClient.email}
                  onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                  required 
                />
              </div>
              <div className={styles.formGroup}>
                <label>TTN DevEUI (Nodo Central)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. A84041000181XXXX"
                  value={newClient.devEui}
                  onChange={(e) => setNewClient({...newClient, devEui: e.target.value})}
                  required 
                />
              </div>
              <button type="submit" className="btn-primary">Registrar Cliente</button>
            </form>
          </div>
        )}

        {/* Tabla de clientes */}
        <div className={`glass-panel ${styles.tableContainer}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Contacto</th>
                <th>DevEUI (TTN)</th>
                <th>Válvulas / Nodos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr key={client.id}>
                  <td><strong>{client.name}</strong></td>
                  <td>{client.email}</td>
                  <td><code className={styles.code}>{client.devEui}</code></td>
                  <td>{client.valves} disp.</td>
                  <td>
                    <button className={styles.actionBtn}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
