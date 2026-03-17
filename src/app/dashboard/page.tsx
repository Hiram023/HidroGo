"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dbService } from "../../services/dbReal";
import { Device, User, ConsumoLog } from "../../types/models";
import styles from "./dashboard.module.css";

export default function ClientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [consumoLogs, setConsumoLogs] = useState<ConsumoLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("userContext");
    if (!storedUser) { router.push("/login"); return; }

    const parsedUser = JSON.parse(storedUser) as User;
    if (parsedUser.role !== "CLIENT" || !parsedUser.clientId) { router.push("/login"); return; }

    setUser(parsedUser);

    const loadAll = async () => {
      try {
        const [clientDevices, logs] = await Promise.all([
          dbService.getClientDevices(parsedUser.clientId!),
          dbService.getConsumoLogs(parsedUser.clientId!)
        ]);
        setDevices(clientDevices);
        setConsumoLogs(logs);
      } catch (err) {
        console.error("Error cargando datos:", err);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [router]);

  // ─── Toggle ON/OFF vía Downlink TTN ───────────────────────────
  const handleToggle = async (devEui: string, currentStatus: string) => {
    // Optimistic UI
    setDevices(devices.map(d =>
      d.devEui === devEui ? { ...d, status: currentStatus === "ON" ? "OFF" : "ON" } as Device : d
    ));

    try {
      const response = await fetch('/api/ttn/downlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devEui, command: currentStatus === "ON" ? "OFF" : "ON" })
      });
      if (!response.ok) throw new Error("TTN rechazó el comando");
      await dbService.toggleDeviceStatus(devEui, currentStatus);
    } catch (err) {
      console.error("Error en toggle, revirtiendo:", err);
      setDevices(devices.map(d =>
        d.devEui === devEui ? { ...d, status: currentStatus } as Device : d
      ));
      alert("No se pudo enviar el comando al nodo. Verifica la conexión TTN.");
    }
  };

  // ─── Exportar CSV ─────────────────────────────────────────────
  const exportCSV = () => {
    if (consumoLogs.length === 0) { alert("No hay datos de consumo para exportar."); return; }

    const headers = ["Fecha y Hora", "DevEUI", "Consumo", "Batería (%)", "Humedad (%)", "Temperatura (°C)"];
    const rows = consumoLogs.map(log => {
      const fecha = log.timestamp?.toDate?.()
        ? log.timestamp.toDate().toLocaleString("es-MX")
        : "—";
      return [fecha, log.devEui, log.consumo, log.battery ?? "", log.humidity ?? "", log.temperature ?? ""];
    });

    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HidroGo_Consumo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userContext");
    router.push("/login");
  };

  if (loading || !user) {
    return <div className={styles.loading}>Cargando tu panel de control...</div>;
  }

  // ─── Calcular resumen de consumo ──────────────────────────────
  const medidores = devices.filter(d => d.type === "MEDIDOR");
  const consumoTotal = medidores.reduce((acc, d) => acc + (d.consumo ?? 0), 0);
  const controllables = devices.filter(d => d.type === "POZO" || d.type === "VALVULA");

  return (
    <div className={styles.dashboardLayout}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1>HidroGo</h1>
          <span className={styles.roleBadge}>Panel del Cliente</span>
        </div>
        <div className={styles.userInfo}>
          <span>{user.email}</span>
          <button onClick={handleLogout} className={styles.logoutBtn}>Salir</button>
        </div>
      </header>

      <main className={styles.mainContent}>
        {/* ── Tarjeta de Consumo Total ───────────────────────── */}
        {medidores.length > 0 && (
          <section className={styles.consumoSection}>
            <div className={`glass-panel ${styles.consumoCard}`}>
              <div className={styles.consumoIcon}>💧</div>
              <div className={styles.consumoData}>
                <span className={styles.consumoLabel}>Consumo Total Actual</span>
                <span className={styles.consumoValue}>{consumoTotal.toLocaleString("es-MX", { maximumFractionDigits: 2 })} M³</span>
              </div>
              <div className={styles.consumoMeta}>
                <span>{medidores.length} medidor{medidores.length > 1 ? "es" : ""} activo{medidores.length > 1 ? "s" : ""}</span>
              </div>
            </div>
          </section>
        )}

        {/* ── Dispositivos Controlables (Pozos y Válvulas) ───── */}
        <section className={styles.welcomeSection}>
          <h2>Control de Operación</h2>
          <p>Pozos y válvulas conectados vía The Things Network.</p>
        </section>

        <section className={styles.devicesGrid}>
          {controllables.map((device) => (
            <div key={device.devEui} className={`glass-panel ${styles.deviceCard}`}>
              <div className={styles.cardHeader}>
                <div className={styles.deviceTypeIcon}>
                  {device.type === "POZO" ? "⛽" : "🚰"}
                </div>
                <h3>{device.name}</h3>
                <span className={`${styles.statusBadge} ${device.status === "ON" ? styles.statusOn : styles.statusOff}`}>
                  {device.status}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Tipo:</span>
                  <span className={styles.value}>{device.type === "POZO" ? "Bomba de Pozo" : "Válvula"}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>DevEUI:</span>
                  <span className={styles.value}><code className={styles.code}>{device.devEui}</code></span>
                </div>
              </div>
              <div className={styles.cardAction}>
                <button
                  className={`btn-primary ${styles.actionBtn} ${device.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                  onClick={() => handleToggle(device.devEui, device.status)}
                >
                  {device.type === "POZO"
                    ? (device.status === "ON" ? "Apagar Motor" : "Encender Motor")
                    : (device.status === "ON" ? "Cerrar Válvula" : "Abrir Válvula")
                  }
                </button>
              </div>
            </div>
          ))}

          {controllables.length === 0 && (
            <div className={styles.noDevices}>
              <p>No tienes pozos o válvulas asignados actualmente.</p>
            </div>
          )}
        </section>

        {/* ── Tabla Histórica de Consumo ──────────────────────── */}
        {medidores.length > 0 && (
          <section className={styles.historySection}>
            <div className={styles.historyHeader}>
              <h2>Registro Histórico de Consumo</h2>
              <button className="btn-primary" onClick={exportCSV} style={{ fontSize: "0.85rem", padding: "0.5rem 1.2rem" }}>
                📥 Exportar CSV
              </button>
            </div>

            <div className={`glass-panel ${styles.tableContainer}`}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>DevEUI</th>
                    <th>Consumo</th>
                    <th>Batería</th>
                    <th>Humedad</th>
                    <th>Temperatura</th>
                  </tr>
                </thead>
                <tbody>
                  {consumoLogs.map((log, idx) => {
                    const fecha = log.timestamp?.toDate?.()
                      ? log.timestamp.toDate().toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—";
                    return (
                      <tr key={log.id || idx}>
                        <td>{fecha}</td>
                        <td><code className={styles.code}>{log.devEui.slice(-6)}</code></td>
                        <td><strong style={{ color: "#0ea5e9" }}>{log.consumo}</strong></td>
                        <td>{log.battery != null ? `${log.battery}%` : "—"}</td>
                        <td>{log.humidity != null ? `${log.humidity}%` : "—"}</td>
                        <td>{log.temperature != null ? `${log.temperature}°C` : "—"}</td>
                      </tr>
                    );
                  })}
                  {consumoLogs.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                      Aún no hay registros de consumo. Los datos llegarán automáticamente cada hora desde tu medidor.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
