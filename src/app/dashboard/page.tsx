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
  const [activeTab, setActiveTab] = useState<"inicio" | "operaciones">("inicio");

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
      } catch (err) { console.error("Error cargando datos:", err); }
      finally { setLoading(false); }
    };
    loadAll();
  }, [router]);

  // ─── Toggle ON/OFF vía Downlink TTN ─────────────────────
  const handleToggle = async (devEui: string, currentStatus: string) => {
    setDevices(devices.map(d => d.devEui === devEui ? { ...d, status: currentStatus === "ON" ? "OFF" : "ON" } as Device : d));
    try {
      const res = await fetch('/api/ttn/downlink', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devEui, command: currentStatus === "ON" ? "OFF" : "ON" })
      });
      if (!res.ok) throw new Error("TTN rechazó");
      await dbService.toggleDeviceStatus(devEui, currentStatus);
    } catch (err) {
      setDevices(devices.map(d => d.devEui === devEui ? { ...d, status: currentStatus } as Device : d));
      alert("Error enviando comando al nodo.");
    }
  };

  // Toggle grupo completo
  const handleToggleGroup = async (groupName: string, action: "ON" | "OFF") => {
    const groupDevices = devices.filter(d => d.group === groupName && d.type === "VALVULA");
    // Optimistic
    setDevices(devices.map(d => d.group === groupName && d.type === "VALVULA" ? { ...d, status: action } as Device : d));
    for (const dev of groupDevices) {
      try {
        await fetch('/api/ttn/downlink', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ devEui: dev.devEui, command: action })
        });
        await dbService.toggleDeviceStatus(dev.devEui, dev.status);
      } catch (err) { console.error(`Error toggling ${dev.devEui}:`, err); }
    }
  };

  // ─── CSV Export ─────────────────────────────────────────
  const exportCSV = () => {
    if (consumoLogs.length === 0) { alert("No hay datos de consumo para exportar."); return; }
    const headers = ["Fecha y Hora", "Medidor", "Consumo", "Batería (%)", "Humedad (%)", "Temperatura (°C)"];
    const rows = consumoLogs.map(log => {
      const fecha = log.timestamp?.toDate?.() ? log.timestamp.toDate().toLocaleString("es-MX") : "—";
      const nombre = getDeviceName(log.devEui);
      return [fecha, nombre, log.consumo, log.battery ?? "", log.humidity ?? "", log.temperature ?? ""];
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

  const handleLogout = () => { sessionStorage.removeItem("userContext"); router.push("/login"); };

  const getDeviceName = (devEui: string) => {
    const d = devices.find(d => d.devEui === devEui);
    return d ? d.name : devEui.slice(-6);
  };

  if (loading || !user) return <div className={styles.loading}>Cargando tu panel de control...</div>;

  // ─── Clasificar dispositivos ────────────────────────────
  const medidores = devices.filter(d => d.type === "MEDIDOR");
  const consumoTotal = medidores.reduce((acc, d) => acc + (d.consumo ?? 0), 0);
  const pozos = devices.filter(d => d.type === "POZO");
  const rebombeos = devices.filter(d => d.type === "REBOMBEO");
  const valvulas = devices.filter(d => d.type === "VALVULA");

  // Agrupar válvulas por sección
  const valvulaGroups: Record<string, Device[]> = {};
  const valvulasSinGrupo: Device[] = [];
  valvulas.forEach(v => {
    if (v.group) {
      if (!valvulaGroups[v.group]) valvulaGroups[v.group] = [];
      valvulaGroups[v.group].push(v);
    } else {
      valvulasSinGrupo.push(v);
    }
  });

  return (
    <div className={styles.dashboardLayout}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1>HidroGo</h1>
          <span className={styles.roleBadge}>Panel del Cliente</span>
        </div>
        <nav className={styles.tabNav}>
          <button className={`${styles.tabBtn} ${activeTab === "inicio" ? styles.tabActive : ""}`} onClick={() => setActiveTab("inicio")}>
            📊 Inicio
          </button>
          <button className={`${styles.tabBtn} ${activeTab === "operaciones" ? styles.tabActive : ""}`} onClick={() => setActiveTab("operaciones")}>
            ⚙️ Operaciones
          </button>
        </nav>
        <div className={styles.userInfo}>
          <span>{user.email}</span>
          <button onClick={handleLogout} className={styles.logoutBtn}>Salir</button>
        </div>
      </header>

      <main className={styles.mainContent}>

        {/* ═══════════════ PESTAÑA INICIO ═══════════════ */}
        {activeTab === "inicio" && (
          <>
            {/* Tarjeta de Consumo Total */}
            {medidores.length > 0 && (
              <section className={styles.consumoSection}>
                <div className={`glass-panel ${styles.consumoCard}`}>
                  <div className={styles.consumoIcon}>💧</div>
                  <div className={styles.consumoData}>
                    <span className={styles.consumoLabel}>Consumo Total Actual</span>
                    <span className={styles.consumoValue}>{consumoTotal.toLocaleString("es-MX", { maximumFractionDigits: 2 })} M³</span>
                  </div>
                  <div className={styles.consumoMeta}>
                    <span>{medidores.length} medidor{medidores.length > 1 ? "es" : ""}</span>
                  </div>
                </div>
              </section>
            )}

            {/* Tarjetas individuales por medidor */}
            {medidores.length > 1 && (
              <section className={styles.medidoresGrid}>
                {medidores.map(m => (
                  <div key={m.devEui} className={`glass-panel ${styles.medidorCard}`}>
                    <div className={styles.medidorIcon}>🔵</div>
                    <div className={styles.medidorInfo}>
                      <span className={styles.medidorName}>{m.name}</span>
                      <span className={styles.medidorValue}>{(m.consumo ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })} M³</span>
                    </div>
                    <div className={styles.medidorEui}><code>{m.devEui.slice(-6)}</code></div>
                  </div>
                ))}
              </section>
            )}

            {/* Un solo medidor — mostrar su nombre */}
            {medidores.length === 1 && (
              <section className={styles.medidoresGrid}>
                <div className={`glass-panel ${styles.medidorCard}`}>
                  <div className={styles.medidorIcon}>🔵</div>
                  <div className={styles.medidorInfo}>
                    <span className={styles.medidorName}>{medidores[0].name}</span>
                    <span className={styles.medidorValue}>{(medidores[0].consumo ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })} M³</span>
                  </div>
                </div>
              </section>
            )}

            {/* Tabla Histórica */}
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
                      <th>Medidor</th>
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
                          <td><strong>{getDeviceName(log.devEui)}</strong></td>
                          <td><strong style={{ color: "#0ea5e9" }}>{log.consumo}</strong></td>
                          <td>{log.battery != null ? `${log.battery}%` : "—"}</td>
                          <td>{log.humidity != null ? `${log.humidity}%` : "—"}</td>
                          <td>{log.temperature != null ? `${log.temperature}°C` : "—"}</td>
                        </tr>
                      );
                    })}
                    {consumoLogs.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                        Los datos llegarán automáticamente cada hora desde tus medidores.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {medidores.length === 0 && (
              <div className={styles.noDevices}><p>No tienes medidores de consumo asignados. Contacta a tu administrador.</p></div>
            )}
          </>
        )}

        {/* ═══════════════ PESTAÑA OPERACIONES ═══════════════ */}
        {activeTab === "operaciones" && (
          <>
            {/* Pozos */}
            {pozos.length > 0 && (
              <section>
                <h2 className={styles.sectionTitle}>⛽ Pozos</h2>
                <div className={styles.devicesGrid}>
                  {pozos.map(d => (
                    <div key={d.devEui} className={`glass-panel ${styles.deviceCard}`}>
                      <div className={styles.cardHeader}>
                        <div className={styles.deviceTypeIcon}>⛽</div>
                        <h3>{d.name}</h3>
                        <span className={`${styles.statusBadge} ${d.status === "ON" ? styles.statusOn : styles.statusOff}`}>{d.status}</span>
                      </div>
                      <div className={styles.cardAction}>
                        <button className={`btn-primary ${styles.actionBtn} ${d.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                          onClick={() => handleToggle(d.devEui, d.status)}>
                          {d.status === "ON" ? "Apagar Motor" : "Encender Motor"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Rebombeos */}
            {rebombeos.length > 0 && (
              <section>
                <h2 className={styles.sectionTitle}>🔄 Rebombeo</h2>
                <div className={styles.devicesGrid}>
                  {rebombeos.map(d => (
                    <div key={d.devEui} className={`glass-panel ${styles.deviceCard}`}>
                      <div className={styles.cardHeader}>
                        <div className={styles.deviceTypeIcon}>🔄</div>
                        <h3>{d.name}</h3>
                        <span className={`${styles.statusBadge} ${d.status === "ON" ? styles.statusOn : styles.statusOff}`}>{d.status}</span>
                      </div>
                      <div className={styles.cardAction}>
                        <button className={`btn-primary ${styles.actionBtn} ${d.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                          onClick={() => handleToggle(d.devEui, d.status)}>
                          {d.status === "ON" ? "Apagar Rebombeo" : "Encender Rebombeo"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Válvulas por grupo */}
            {Object.keys(valvulaGroups).length > 0 && (
              <section>
                <h2 className={styles.sectionTitle}>🚰 Válvulas por Sección</h2>
                {Object.entries(valvulaGroups).map(([groupName, groupValves]) => {
                  const allOn = groupValves.every(v => v.status === "ON");
                  return (
                    <div key={groupName} className={`glass-panel ${styles.valveGroup}`}>
                      <div className={styles.groupHeader}>
                        <h3>📁 {groupName}</h3>
                        <div className={styles.groupActions}>
                          <button className={`btn-primary ${styles.btnSuccess}`} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                            onClick={() => handleToggleGroup(groupName, "ON")}>
                            Abrir Todas
                          </button>
                          <button className={`btn-primary ${styles.btnDanger}`} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                            onClick={() => handleToggleGroup(groupName, "OFF")}>
                            Cerrar Todas
                          </button>
                        </div>
                      </div>
                      <div className={styles.groupValves}>
                        {groupValves.map(v => (
                          <div key={v.devEui} className={styles.valveItem}>
                            <span className={styles.valveName}>{v.name}</span>
                            <span className={`${styles.statusBadge} ${v.status === "ON" ? styles.statusOn : styles.statusOff}`}>{v.status}</span>
                            <button className={`btn-primary ${v.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                              onClick={() => handleToggle(v.devEui, v.status)}>
                              {v.status === "ON" ? "Cerrar" : "Abrir"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* Válvulas sin grupo */}
            {valvulasSinGrupo.length > 0 && (
              <section>
                <h2 className={styles.sectionTitle}>🚰 Válvulas Individuales</h2>
                <div className={styles.devicesGrid}>
                  {valvulasSinGrupo.map(d => (
                    <div key={d.devEui} className={`glass-panel ${styles.deviceCard}`}>
                      <div className={styles.cardHeader}>
                        <div className={styles.deviceTypeIcon}>🚰</div>
                        <h3>{d.name}</h3>
                        <span className={`${styles.statusBadge} ${d.status === "ON" ? styles.statusOn : styles.statusOff}`}>{d.status}</span>
                      </div>
                      <div className={styles.cardAction}>
                        <button className={`btn-primary ${styles.actionBtn} ${d.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                          onClick={() => handleToggle(d.devEui, d.status)}>
                          {d.status === "ON" ? "Cerrar Válvula" : "Abrir Válvula"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {pozos.length === 0 && rebombeos.length === 0 && valvulas.length === 0 && (
              <div className={styles.noDevices}><p>No tienes equipos de operación asignados. Contacta a tu administrador.</p></div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
