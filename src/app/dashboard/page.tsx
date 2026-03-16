"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dbService } from "../../services/dbReal";
import { Device, User } from "../../types/models";
import styles from "./dashboard.module.css";

export default function ClientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Recuperar usuario mockeado
    const storedUser = sessionStorage.getItem("userContext");
    if (!storedUser) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(storedUser) as User;
    if (parsedUser.role !== "CLIENT" || !parsedUser.clientId) {
      router.push("/login");
      return;
    }

    setUser(parsedUser);
    
    // Cargar dispositivos Filtrados por Owner ID (clientId)
    const loadDevices = async () => {
      const clientDevices = await dbService.getClientDevices(parsedUser.clientId!);
      setDevices(clientDevices);
      setLoading(false);
    };

    loadDevices();
  }, [router]);

  const handleToggle = async (devEui: string, currentStatus: string) => {
    // Optimistic UI Update MOCK
    setDevices(devices.map(d => d.devEui === devEui ? { ...d, status: currentStatus === "ON" ? "OFF" : "ON" } : d));
    
    // Simulamos que enviamos el comando a TTN Downlink y actualizamos db
    await dbService.toggleDeviceStatus(devEui, currentStatus);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userContext");
    router.push("/login");
  };

  if (loading || !user) {
    return <div className={styles.loading}>Cargando tu panel de control...</div>;
  }

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
        <section className={styles.welcomeSection}>
          <h2>Resumen de Operación</h2>
          <p>Control y monitoreo de tus pozos y válvulas conectadas a The Things Network.</p>
        </section>

        <section className={styles.devicesGrid}>
          {devices.map((device) => (
            <div key={device.devEui} className={`glass-panel ${styles.deviceCard}`}>
              <div className={styles.cardHeader}>
                <div className={styles.deviceTypeIcon}>
                  {device.type === "POZO" ? "💧" : "🚰"}
                </div>
                <h3>{device.name}</h3>
                <span className={`${styles.statusBadge} ${device.status === "ON" ? styles.statusOn : styles.statusOff}`}>
                  {device.status}
                </span>
              </div>
              
              <div className={styles.cardBody}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Tipo:</span>
                  <span className={styles.value}>{device.type}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>N° DevEUI:</span>
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

          {devices.length === 0 && (
            <div className={styles.noDevices}>
              <p>No tienes dispositivos asignados a tu cuenta actualmente.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
