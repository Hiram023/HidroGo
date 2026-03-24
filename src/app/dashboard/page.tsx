"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dbService } from "../../services/dbReal";
import { Device, User, ConsumoLog } from "../../types/models";
import FlowRateChart from "../../components/FlowRateChart";
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

  const handleToggle = async (devEui: string, currentStatus: string) => {
    setDevices(prev => prev.map(d => d.devEui === devEui ? { ...d, status: currentStatus === "ON" ? "OFF" : "ON" } as Device : d));
    try {
      const res = await fetch('/api/ttn/downlink', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devEui, command: currentStatus === "ON" ? "OFF" : "ON" })
      });
      if (!res.ok) throw new Error("TTN rechazó");
      await dbService.toggleDeviceStatus(devEui, currentStatus);
    } catch (err) {
      setDevices(prev => prev.map(d => d.devEui === devEui ? { ...d, status: currentStatus } as Device : d));
      alert("Error enviando comando al nodo.");
    }
  };

  const handleToggleGroup = async (groupName: string, action: "ON" | "OFF") => {
    const groupDevices = devices.filter(d => d.group === groupName && d.type === "VALVULA");
    setDevices(prev => prev.map(d => d.group === groupName && d.type === "VALVULA" ? { ...d, status: action } as Device : d));
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

  // Helper: calcular caudal (l/s) entre dos logs consecutivos
  const MAX_INTERVAL = 65 * 60; // 65 minutos en segundos
  const calcCaudal = (idx: number): number => {
    // consumoLogs está ordenado DESC (más reciente primero)
    if (idx >= consumoLogs.length - 1) return 0;
    const curr = consumoLogs[idx];
    const next = consumoLogs[idx + 1]; // el anterior en el tiempo
    const delta = curr.consumo - next.consumo;
    const currDate = curr.timestamp?.toDate?.() || new Date(0);
    const nextDate = next.timestamp?.toDate?.() || new Date(0);
    const intervalSec = (currDate.getTime() - nextDate.getTime()) / 1000;
    // Si el intervalo es > 65 min o inválido, caudal = 0 (dato no confiable)
    if (intervalSec > MAX_INTERVAL || intervalSec <= 0 || delta < 0) return 0;
    return delta === 0 ? 0 : Number(((delta * 1000) / intervalSec).toFixed(1));
  };

  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  const exportCSV = () => {
    if (consumoLogs.length === 0) { alert("No hay datos de consumo para exportar."); return; }
    const headers = ["Año", "Mes", "Día", "Hora", "Medidor", "Consumo (m3)", "Caudal (l/s)", "Bateria (%)", "Humedad (%)", "Temperatura (C)"];
    const rows = consumoLogs.map((log, idx) => {
      const d = log.timestamp?.toDate?.() ? log.timestamp.toDate() : null;
      const dia = d ? d.getDate() : "";
      const mes = d ? meses[d.getMonth()] : "";
      const anio = d ? d.getFullYear() : "";
      const hora = d ? d.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
      const caudal = calcCaudal(idx);
      return [anio, mes, dia, hora, getDeviceName(log.devEui), log.consumo, caudal, log.battery ?? "", log.humidity ?? "", log.temperature ?? ""];
    });
    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RiegoSon_Consumo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => { sessionStorage.removeItem("userContext"); router.push("/login"); };
  const getDeviceName = (devEui: string) => {
    const d = devices.find(dev => dev.devEui === devEui);
    return d ? d.name : devEui.slice(-6);
  };

  if (loading || !user) return <div className={styles.loading}>Cargando tu panel de control...</div>;

  const medidores = devices.filter(d => d.type === "MEDIDOR");
  const consumoTotal = medidores.reduce((acc, d) => acc + (d.consumo ?? 0), 0);
  const pozos = devices.filter(d => d.type === "POZO");
  const rebombeos = devices.filter(d => d.type === "REBOMBEO");
  const valvulas = devices.filter(d => d.type === "VALVULA");

  const valvulaGroups: Record<string, Device[]> = {};
  const valvulasSinGrupo: Device[] = [];
  valvulas.forEach(v => {
    if (v.group) {
      if (!valvulaGroups[v.group]) valvulaGroups[v.group] = [];
      valvulaGroups[v.group].push(v);
    } else { valvulasSinGrupo.push(v); }
  });

  return (
    <div className={styles.dashboardLayout}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1>RiegoSon</h1>
          <span className={styles.roleBadge}>Panel del Cliente</span>
        </div>
        <nav className={styles.tabNav}>
          <button className={`${styles.tabBtn} ${activeTab === "inicio" ? styles.tabActive : ""}`} onClick={() => setActiveTab("inicio")}>
            Inicio
          </button>
          <button className={`${styles.tabBtn} ${activeTab === "operaciones" ? styles.tabActive : ""}`} onClick={() => setActiveTab("operaciones")}>
            Operaciones
          </button>
        </nav>
        <div className={styles.userInfo}>
          <button onClick={handleLogout} className={styles.logoutBtn}>Salir</button>
          <span>{user.email}</span>
        </div>
      </header>

      <main className={styles.mainContent}>

        {/* ═══════ INICIO: Consumo + Gráficas + Historial ═══════ */}
        {activeTab === "inicio" && (
          <>
            {/* Consumo Total */}
            {medidores.length > 0 && (
              <section className={styles.consumoSection}>
                <div className={`glass-panel ${styles.consumoCard}`}>
                  <div className={styles.consumoData}>
                    <span className={styles.consumoLabel}>Consumo Total Actual</span>
                    <span className={styles.consumoValue}>{Math.round(consumoTotal / 1000)} Mm³</span>
                  </div>
                  <div className={styles.consumoMeta}>
                    <span>{medidores.length} medidor{medidores.length > 1 ? "es" : ""}</span>
                  </div>
                </div>
              </section>
            )}

            {/* Medidores individuales + Gráfica de Caudal */}
            {medidores.map(m => {
              // Calcular último caudal para este medidor
              const medidorLogs = consumoLogs.filter(l => l.devEui === m.devEui);
              let ultimoCaudal = 0;
              if (medidorLogs.length >= 2) {
                const delta = medidorLogs[0].consumo - medidorLogs[1].consumo;
                const d0 = medidorLogs[0].timestamp?.toDate?.() || new Date(0);
                const d1 = medidorLogs[1].timestamp?.toDate?.() || new Date(0);
                const intSec = (d0.getTime() - d1.getTime()) / 1000;
                ultimoCaudal = (intSec > MAX_INTERVAL || intSec <= 0 || delta < 0) ? 0 : (delta === 0 ? 0 : Number(((delta * 1000) / intSec).toFixed(1)));
              }
              return (
                <section key={m.devEui} className={styles.medidorSection}>
                  <div className={`glass-panel ${styles.medidorCard}`}>
                    <div className={styles.medidorInfo}>
                      <span className={styles.medidorName}>{m.name}</span>
                      <span className={styles.medidorValue}>{(m.consumo ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³</span>
                      <span className={styles.medidorCaudal}>{ultimoCaudal.toFixed(1)} l/s</span>
                    </div>
                    {m.lastUplink && (
                      <span className={styles.lastUplink}>Último reporte: {new Date(m.lastUplink).toLocaleString("es-MX", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                    )}
                  </div>
                  <FlowRateChart devEui={m.devEui} deviceName={m.name} />
                </section>
              );
            })}

            {/* Tabla Histórica */}
            {medidores.length > 0 && (
              <section className={styles.historySection}>
                <div className={styles.historyHeader}>
                  <h2>Registro Histórico de Consumo</h2>
                  <button className="btn-primary" onClick={exportCSV} style={{ fontSize: "0.85rem", padding: "0.5rem 1.2rem" }}>
                    Exportar CSV
                  </button>
                </div>
                <div className={`glass-panel ${styles.tableContainer}`}>
                  <table className={styles.historyTable}>
                    <thead>
                      <tr><th>Fecha y Hora</th><th>Medidor</th><th>Consumo</th><th>Caudal (l/s)</th><th>Batería</th><th>Humedad</th><th>Temperatura</th></tr>
                    </thead>
                    <tbody>
                      {consumoLogs.map((log, idx) => {
                        const d = log.timestamp?.toDate?.();
                        const fecha = d
                          ? `${d.getDate()} ${meses[d.getMonth()]}, ${d.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                          : "—";
                        const caudal = calcCaudal(idx);
                        return (
                          <tr key={log.id || idx}>
                            <td>{fecha}</td>
                            <td><strong>{getDeviceName(log.devEui)}</strong></td>
                            <td><strong className={styles.consumoCell}>{log.consumo}</strong></td>
                            <td><strong>{caudal.toFixed(1)}</strong></td>
                            <td>{log.battery != null ? `${log.battery}%` : "—"}</td>
                            <td>{log.humidity != null ? `${log.humidity}%` : "—"}</td>
                            <td>{log.temperature != null ? `${log.temperature}°C` : "—"}</td>
                          </tr>
                        );
                      })}
                      {consumoLogs.length === 0 && (
                        <tr><td colSpan={7} className={styles.emptyRow}>
                          Los datos llegarán automáticamente cada hora desde tus medidores.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {medidores.length === 0 && (
              <div className={styles.noDevices}><p>No tienes medidores de consumo asignados. Contacta a tu administrador.</p></div>
            )}
          </>
        )}

        {/* ═══════ OPERACIONES: Pozos + Rebombeo + Válvulas ═══════ */}
        {activeTab === "operaciones" && (
          <>
            {/* Pozos */}
            {pozos.length > 0 && (
              <section className={styles.opsSection}>
                <h2 className={styles.sectionTitle}>Pozos</h2>
                <div className={styles.devicesGrid}>
                  {pozos.map(d => (
                    <div key={d.devEui} className={`glass-panel ${styles.deviceCard}`}>
                      <div className={styles.cardHeader}>
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
              <section className={styles.opsSection}>
                <h2 className={styles.sectionTitle}>Rebombeo</h2>
                <div className={styles.devicesGrid}>
                  {rebombeos.map(d => (
                    <div key={d.devEui} className={`glass-panel ${styles.deviceCard}`}>
                      <div className={styles.cardHeader}>
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

            {/* Válvulas por sección */}
            {Object.keys(valvulaGroups).length > 0 && (
              <section className={styles.opsSection}>
                <h2 className={styles.sectionTitle}>Válvulas por Sección</h2>
                {Object.entries(valvulaGroups).map(([groupName, groupValves]) => (
                  <div key={groupName} className={`glass-panel ${styles.valveGroup}`}>
                    <div className={styles.groupHeader}>
                      <h3>{groupName}</h3>
                      <div className={styles.groupActions}>
                        <button className={`btn-primary ${styles.btnSuccess}`} style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}
                          onClick={() => handleToggleGroup(groupName, "ON")}>Abrir Todas</button>
                        <button className={`btn-primary ${styles.btnDanger}`} style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}
                          onClick={() => handleToggleGroup(groupName, "OFF")}>Cerrar Todas</button>
                      </div>
                    </div>
                    <div className={styles.groupValves}>
                      {groupValves.map(v => (
                        <div key={v.devEui} className={styles.valveItem}>
                          <span className={styles.valveName}>{v.name}</span>
                          <span className={`${styles.statusBadge} ${v.status === "ON" ? styles.statusOn : styles.statusOff}`}>{v.status}</span>
                          <button className={`btn-primary ${v.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                            style={{ padding: "0.3rem 0.8rem", fontSize: "0.75rem" }}
                            onClick={() => handleToggle(v.devEui, v.status)}>
                            {v.status === "ON" ? "Cerrar" : "Abrir"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Válvulas individuales */}
            {valvulasSinGrupo.length > 0 && (
              <section className={styles.opsSection}>
                <h2 className={styles.sectionTitle}>Válvulas Individuales</h2>
                <div className={styles.devicesGrid}>
                  {valvulasSinGrupo.map(d => (
                    <div key={d.devEui} className={`glass-panel ${styles.deviceCard}`}>
                      <div className={styles.cardHeader}>
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
