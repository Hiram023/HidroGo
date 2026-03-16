"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";
import { dbService } from "../../services/dbReal";
import { Device, DeviceType, DeviceState } from "../../types/models";

type Client = {
  id: string;
  name: string;
  email: string;
  devEui?: string;
  valves?: number;
};

export default function AdminDashboard() {
  const router = useRouter();
  
  // Data States
  const [clients, setClients] = useState<Client[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // UI States
  const [activeTab, setActiveTab] = useState<"clients" | "devices">("clients");
  const [showClientForm, setShowClientForm] = useState(false);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{text: string, type: "error" | "success"} | null>(null);

  // Form States
  const [newClient, setNewClient] = useState({ name: "", email: "", devEui: "" });
  const [newDevice, setNewDevice] = useState({ devEui: "", name: "", type: "VALVULA" as DeviceType, ownerId: "" });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const clientsData = await dbService.getAllClients();
      const devicesData = await dbService.getAllDevices();
      setClients(clientsData as Client[]);
      setDevices(devicesData as Device[]);
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
      setShowClientForm(false);
      loadData(); 
      alert(`Cliente Registrado\nCorreo: ${newClient.email}\nContraseña Temporal: ${result.tempPassword}`);
    } else {
      setMessage({ text: `Error: ${result.error}`, type: "error" });
    }
    setIsSubmitting(false);
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Direct insertion in Firebase
      const { doc, setDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      
      const status: DeviceState = newDevice.type === "MEDIDOR" ? "LECTURA" : "OFF";
      
      await setDoc(doc(db, "devices", newDevice.devEui), {
        name: newDevice.name,
        type: newDevice.type,
        status: status,
        ownerId: newDevice.ownerId,
        consumo: newDevice.type === "MEDIDOR" ? 0 : undefined
      });
      
      setMessage({ text: `Nodo ${newDevice.devEui} agregado con éxito`, type: "success" });
      setNewDevice({ devEui: "", name: "", type: "VALVULA", ownerId: "" });
      setShowDeviceForm(false);
      loadData();
    } catch (error: any) {
      setMessage({ text: `Error creando nodo: ${error.message}`, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDevice = async (devEui: string, currentStatus: string) => {
    // Optimistic Update
    setDevices(devices.map(d => d.devEui === devEui ? { ...d, status: currentStatus === "ON" ? "OFF" : "ON" } as Device : d));
    
    // API Call
    try {
      const response = await fetch('/api/ttn/downlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          devEui, 
          command: currentStatus === "ON" ? "OFF" : "ON" 
        })
      });
      if(!response.ok) throw new Error("Error en TTN");
      await dbService.toggleDeviceStatus(devEui, currentStatus);
    } catch(err) {
      console.error("Revertiendo optimist toggle", err);
      // Revert if error
      setDevices(devices.map(d => d.devEui === devEui ? { ...d, status: currentStatus } as Device : d));
      alert("Error enviando comando al nodo físico.");
    }
  };

  const getClientName = (ownerId: string) => {
    const c = clients.find(c => c.id === ownerId);
    return c ? c.name : "Desconocido (" + ownerId + ")";
  };

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h2>HidroGo</h2>
          <span>Control Maestro</span>
        </div>
        <nav className={styles.nav}>
          <a href="#" className={activeTab === "clients" ? styles.active : ""} onClick={() => setActiveTab("clients")}>Gestión de Clientes</a>
          <a href="#" className={activeTab === "devices" ? styles.active : ""} onClick={() => setActiveTab("devices")}>Nodos Globales (IoT)</a>
          <a href="#">Reportes de Red</a>
        </nav>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Cerrar Sesión
        </button>
      </aside>

      <main className={styles.mainContent}>
        <header className={styles.header}>
          <h1>{activeTab === "clients" ? "Panel de Clientes" : "Control de Nodos IoT"}</h1>
          {activeTab === "clients" ? (
            <button className="btn-primary" onClick={() => setShowClientForm(!showClientForm)}>
              {showClientForm ? "Cancelar" : "+ Nuevo Cliente"}
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setShowDeviceForm(!showDeviceForm)}>
              {showDeviceForm ? "Cancelar" : "+ Asignar Nodo"}
            </button>
          )}
        </header>

        {message && (
          <div style={{ padding: "1rem", marginBottom: "1rem", borderRadius: "8px", background: message.type === "success" ? "#dcfce7" : "#fee2e2", color: message.type === "success" ? "#166534" : "#991b1b" }}>
            {message.text}
          </div>
        )}

        {/* TAB: CLIENTES */}
        {activeTab === "clients" && (
          <>
            {showClientForm && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Alta de Nuevo Cliente</h2>
                <form onSubmit={handleAddClient} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label>Nombre de la Agrícola / Rancho</label>
                    <input type="text" className="input-field" value={newClient.name} onChange={(e) => setNewClient({...newClient, name: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Correo Electrónico (Para que él inicie sesión)</label>
                    <input type="email" className="input-field" value={newClient.email} onChange={(e) => setNewClient({...newClient, email: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Primer TTN DevEUI (Nodo Central Opcional)</label>
                    <input type="text" className="input-field" placeholder="Ej. A84041000181XXXX" value={newClient.devEui} onChange={(e) => setNewClient({...newClient, devEui: e.target.value})} required />
                  </div>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Creando..." : "Registrar Cliente e Inyectar Nodos"}
                  </button>
                </form>
              </div>
            )}

            <div className={`glass-panel ${styles.tableContainer}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Contacto (Login)</th>
                    <th>Nodos Propios</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(client => (
                    <tr key={client.id}>
                      <td><strong>{client.name}</strong></td>
                      <td>{client.email}</td>
                      <td>{devices.filter(d => d.ownerId === client.id).length} en red</td>
                      <td><button className={styles.actionBtn}>Editar</button></td>
                    </tr>
                  ))}
                  {clients.length === 0 && !loading && <tr><td colSpan={4}>No hay clientes registrados</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TAB: NODOS (DISPOSITIVOS) */}
        {activeTab === "devices" && (
          <>
            {showDeviceForm && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Asignar Nuevo Nodo a Cliente</h2>
                <form onSubmit={handleAddDevice} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label>DevEUI de TTN (Dirección Física MAC)</label>
                    <input type="text" className="input-field" placeholder="Ej. 24E124128XXXX" value={newDevice.devEui} onChange={(e) => setNewDevice({...newDevice, devEui: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Nombre Identificador</label>
                    <input type="text" className="input-field" placeholder="Ej. Pozo Sur 2 / Medidor General" value={newDevice.name} onChange={(e) => setNewDevice({...newDevice, name: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Tipo de Hardware</label>
                    <select className="input-field" value={newDevice.type} onChange={(e) => setNewDevice({...newDevice, type: e.target.value as DeviceType})} required>
                      <option value="VALVULA">Válvula Reguladora de Flujo (UC300/511)</option>
                      <option value="POZO">Bomba de Pozo (Relé UC300)</option>
                      <option value="MEDIDOR">Medidor de Consumo de Cúbicos (EM300-DI)</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Asignar al Cliente (Dueño)</label>
                    <select className="input-field" value={newDevice.ownerId} onChange={(e) => setNewDevice({...newDevice, ownerId: e.target.value})} required>
                      <option value="">Seleccione un propietario...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Registrando..." : "Añadir a la Nube"}
                  </button>
                </form>
              </div>
            )}

            <div className={`glass-panel ${styles.tableContainer}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>EUI (HW ID)</th>
                    <th>Identificador</th>
                    <th>Pertenece a</th>
                    <th>Tipo</th>
                    <th>Estado / Cúbicos</th>
                    <th>Acción Maestra</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(device => (
                    <tr key={device.devEui}>
                      <td><code className={styles.code}>{device.devEui.slice(-6)}</code></td>
                      <td><strong>{device.name}</strong></td>
                      <td>{getClientName(device.ownerId)}</td>
                      <td>{device.type}</td>
                      <td>
                        {device.type === "MEDIDOR" ? (
                          <span style={{color: "#0ea5e9", fontWeight: "bold"}}>{device.consumo ?? 0} M³</span>
                        ) : (
                          <span className={device.status === "ON" ? styles.statusOn : styles.statusOff}>{device.status}</span>
                        )}
                      </td>
                      <td>
                        {device.type !== "MEDIDOR" ? (
                          <button 
                            className={`btn-primary ${device.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                            onClick={() => handleToggleDevice(device.devEui, device.status)}
                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                          >
                            Forzar {device.status === "ON" ? "Apagado" : "Encendido"}
                          </button>
                        ) : (
                           <span style={{fontSize: "0.8rem", color: "#666"}}>Sólo Lectura</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {devices.length === 0 && !loading && <tr><td colSpan={6}>No hay Nodos de Hardware registrados</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
