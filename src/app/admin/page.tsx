"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";
import { dbService } from "../../services/dbReal";
import { Device, DeviceType } from "../../types/models";

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
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"clients" | "devices">("clients");
  const [showClientForm, setShowClientForm] = useState(false);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{text: string, type: "error" | "success"} | null>(null);

  // Form States
  const [newClient, setNewClient] = useState({ name: "", email: "", devEui: "", password: "" });
  const [newDevice, setNewDevice] = useState({ devEui: "", name: "", type: "VALVULA" as DeviceType, ownerId: "", group: "" });

  // Edit States
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [originalDevEui, setOriginalDevEui] = useState<string>("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsData, devicesData] = await Promise.all([
        dbService.getAllClients(),
        dbService.getAllDevices()
      ]);
      setClients(clientsData as Client[]);
      setDevices(devicesData as Device[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleLogout = async () => { await dbService.signOut(); router.push("/login"); };

  // ─── CRUD Clientes ────────────────────────────────────────

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    const result = await dbService.createClientUser(newClient.name, newClient.email, newClient.devEui, newClient.password || undefined);
    if (result.success) {
      setMessage({ text: `Cliente creado. Contraseña: ${result.tempPassword}`, type: "success" });
      setNewClient({ name: "", email: "", devEui: "", password: "" });
      setShowClientForm(false);
      loadData();
      alert(`Cliente Registrado\nCorreo: ${newClient.email}\nContraseña: ${result.tempPassword}`);
    } else {
      setMessage({ text: `Error: ${result.error}`, type: "error" });
    }
    setIsSubmitting(false);
  };

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setIsSubmitting(true);
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      await updateDoc(doc(db, "clients", editingClient.id), {
        name: editingClient.name,
        email: editingClient.email
      });
      // Also update in users collection if email changed
      await updateDoc(doc(db, "users", editingClient.id), {
        email: editingClient.email
      });
      setMessage({ text: "Cliente actualizado", type: "success" });
      setEditingClient(null);
      loadData();
    } catch (error: any) {
      setMessage({ text: `Error: ${error.message}`, type: "error" });
    }
    setIsSubmitting(false);
  };

  const handleDeleteClient = async (clientId: string, clientName: string) => {
    if (!confirm(`¿Seguro que quieres eliminar al cliente "${clientName}"? \n\nEsto eliminará su cuenta y todos sus nodos asociados.`)) return;
    try {
      const { doc, deleteDoc, collection, query, where, getDocs } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      // Delete client devices
      const devQ = query(collection(db, "devices"), where("ownerId", "==", clientId));
      const devSnap = await getDocs(devQ);
      for (const d of devSnap.docs) { await deleteDoc(d.ref); }
      // Delete client doc
      await deleteDoc(doc(db, "clients", clientId));
      // Delete user doc
      await deleteDoc(doc(db, "users", clientId));
      setMessage({ text: `Cliente "${clientName}" eliminado`, type: "success" });
      loadData();
    } catch (error: any) {
      setMessage({ text: `Error eliminando: ${error.message}`, type: "error" });
    }
  };

  // ─── CRUD Nodos ───────────────────────────────────────────

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      const deviceData: any = {
        name: newDevice.name,
        type: newDevice.type,
        status: "OFF",
        ownerId: newDevice.ownerId,
      };
      if (newDevice.type === "MEDIDOR") deviceData.consumo = 0;
      if (newDevice.group.trim()) deviceData.group = newDevice.group.trim();

      await setDoc(doc(db, "devices", newDevice.devEui), deviceData);
      setMessage({ text: `Nodo ${newDevice.devEui} registrado`, type: "success" });
      setNewDevice({ devEui: "", name: "", type: "VALVULA", ownerId: "", group: "" });
      setShowDeviceForm(false);
      loadData();
    } catch (error: any) {
      setMessage({ text: `Error: ${error.message}`, type: "error" });
    }
    setIsSubmitting(false);
  };

  const handleEditDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;
    setIsSubmitting(true);
    try {
      const { doc, setDoc, deleteDoc, getDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      const newEui = editingDevice.devEui.trim();
      const updateData: any = {
        name: editingDevice.name,
        type: editingDevice.type,
        ownerId: editingDevice.ownerId,
      };
      if (editingDevice.group !== undefined) updateData.group = editingDevice.group || null;
      if (editingDevice.consumo !== undefined) updateData.consumo = editingDevice.consumo;
      updateData.status = editingDevice.status || "OFF";

      // Si el DevEUI cambió, migrar el documento
      if (newEui !== originalDevEui) {
        // Leer doc viejo por si tiene campos que no trackeamos
        const oldSnap = await getDoc(doc(db, "devices", originalDevEui));
        const oldData = oldSnap.exists() ? oldSnap.data() : {};
        // Crear nuevo con datos combinados
        await setDoc(doc(db, "devices", newEui), { ...oldData, ...updateData });
        // Borrar el viejo
        await deleteDoc(doc(db, "devices", originalDevEui));
        setMessage({ text: `DevEUI migrado de ${originalDevEui} a ${newEui}`, type: "success" });
      } else {
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "devices", newEui), updateData);
        setMessage({ text: "Nodo actualizado", type: "success" });
      }
      setEditingDevice(null);
      setOriginalDevEui("");
      loadData();
    } catch (error: any) {
      setMessage({ text: `Error: ${error.message}`, type: "error" });
    }
    setIsSubmitting(false);
  };

  const handleDeleteDevice = async (devEui: string, name: string) => {
    if (!confirm(`¿Eliminar permanentemente el nodo "${name}" (${devEui})?`)) return;
    try {
      const { doc, deleteDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      await deleteDoc(doc(db, "devices", devEui));
      setMessage({ text: `Nodo "${name}" eliminado`, type: "success" });
      loadData();
    } catch (error: any) {
      setMessage({ text: `Error: ${error.message}`, type: "error" });
    }
  };

  const handleToggleDevice = async (devEui: string, currentStatus: string) => {
    setDevices(devices.map(d => d.devEui === devEui ? { ...d, status: currentStatus === "ON" ? "OFF" : "ON" } as Device : d));
    try {
      const res = await fetch('/api/ttn/downlink', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devEui, command: currentStatus === "ON" ? "OFF" : "ON" })
      });
      if (!res.ok) throw new Error("TTN error");
      await dbService.toggleDeviceStatus(devEui, currentStatus);
    } catch (err) {
      setDevices(devices.map(d => d.devEui === devEui ? { ...d, status: currentStatus } as Device : d));
      alert("Error enviando comando.");
    }
  };

  const getClientName = (ownerId: string) => {
    const c = clients.find(c => c.id === ownerId);
    return c ? c.name : ownerId.slice(0, 8) + "...";
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
        </nav>
        <button className={styles.logoutBtn} onClick={handleLogout}>Cerrar Sesión</button>
      </aside>

      <main className={styles.mainContent}>
        <header className={styles.header}>
          <h1>{activeTab === "clients" ? "Panel de Clientes" : "Control de Nodos IoT"}</h1>
          {activeTab === "clients" ? (
            <button className="btn-primary" onClick={() => { setShowClientForm(!showClientForm); setEditingClient(null); }}>
              {showClientForm ? "Cancelar" : "+ Nuevo Cliente"}
            </button>
          ) : (
            <button className="btn-primary" onClick={() => { setShowDeviceForm(!showDeviceForm); setEditingDevice(null); }}>
              {showDeviceForm ? "Cancelar" : "+ Asignar Nodo"}
            </button>
          )}
        </header>

        {message && (
          <div style={{ padding: "1rem", marginBottom: "1rem", borderRadius: "8px", background: message.type === "success" ? "#dcfce7" : "#fee2e2", color: message.type === "success" ? "#166534" : "#991b1b" }}>
            {message.text}
          </div>
        )}

        {/* ═══════ TAB: CLIENTES ═══════ */}
        {activeTab === "clients" && (
          <>
            {/* Form Crear Cliente */}
            {showClientForm && !editingClient && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Alta de Nuevo Cliente</h2>
                <form onSubmit={handleAddClient} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label>Nombre del Rancho / Agrícola</label>
                    <input type="text" className="input-field" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Correo Electrónico (Login)</label>
                    <input type="email" className="input-field" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Contraseña (Vacío = HidroGo2026*)</label>
                    <input type="text" className="input-field" placeholder="HidroGo2026*" value={newClient.password} onChange={e => setNewClient({...newClient, password: e.target.value})} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>TTN DevEUI Inicial (Opcional)</label>
                    <input type="text" className="input-field" placeholder="A84041000181XXXX" value={newClient.devEui} onChange={e => setNewClient({...newClient, devEui: e.target.value})} />
                  </div>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Creando..." : "Registrar Cliente"}
                  </button>
                </form>
              </div>
            )}

            {/* Form Editar Cliente */}
            {editingClient && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>✏️ Editar Cliente</h2>
                <form onSubmit={handleEditClient} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label>Nombre</label>
                    <input type="text" className="input-field" value={editingClient.name} onChange={e => setEditingClient({...editingClient, name: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Correo Electrónico</label>
                    <input type="email" className="input-field" value={editingClient.email} onChange={e => setEditingClient({...editingClient, email: e.target.value})} required />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? "Guardando..." : "Guardar Cambios"}
                    </button>
                    <button type="button" className={styles.actionBtn} onClick={() => setEditingClient(null)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            {/* Tabla Clientes */}
            <div className={`glass-panel ${styles.tableContainer}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo (Login)</th>
                    <th>Nodos</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(client => (
                    <tr key={client.id}>
                      <td><strong>{client.name}</strong></td>
                      <td>{client.email}</td>
                      <td>{devices.filter(d => d.ownerId === client.id).length} en red</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button className={styles.actionBtn} onClick={() => { setEditingClient(client); setShowClientForm(false); }}>Editar</button>
                          <button className={styles.deleteBtnSmall} onClick={() => handleDeleteClient(client.id, client.name)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {clients.length === 0 && !loading && <tr><td colSpan={4}>No hay clientes</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══════ TAB: NODOS ═══════ */}
        {activeTab === "devices" && (
          <>
            {/* Form Crear Nodo */}
            {showDeviceForm && !editingDevice && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Asignar Nuevo Nodo</h2>
                <form onSubmit={handleAddDevice} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label>DevEUI de TTN</label>
                    <input type="text" className="input-field" placeholder="24E124128XXXX" value={newDevice.devEui} onChange={e => setNewDevice({...newDevice, devEui: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Nombre Identificador</label>
                    <input type="text" className="input-field" placeholder="Medidor Pozo Norte" value={newDevice.name} onChange={e => setNewDevice({...newDevice, name: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Tipo de Hardware</label>
                    <select className="input-field" value={newDevice.type} onChange={e => setNewDevice({...newDevice, type: e.target.value as DeviceType})} required>
                      <option value="VALVULA">Válvula (UC300/UC511)</option>
                      <option value="POZO">Bomba de Pozo (Relé UC300)</option>
                      <option value="REBOMBEO">Rebombeo (Relé UC300)</option>
                      <option value="MEDIDOR">Medidor Consumo (EM300-DI)</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Asignar al Cliente</label>
                    <select className="input-field" value={newDevice.ownerId} onChange={e => setNewDevice({...newDevice, ownerId: e.target.value})} required>
                      <option value="">Seleccione dueño...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Grupo / Sección (Opcional - para agrupar válvulas)</label>
                    <input type="text" className="input-field" placeholder="Ej: Sección Norte" value={newDevice.group} onChange={e => setNewDevice({...newDevice, group: e.target.value})} />
                  </div>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Registrando..." : "Añadir a la Red"}
                  </button>
                </form>
              </div>
            )}

            {/* Form Editar Nodo */}
            {editingDevice && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Editar Nodo</h2>
                <form onSubmit={handleEditDevice} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label>DevEUI (Dirección MAC)</label>
                    <input type="text" className="input-field" value={editingDevice.devEui} onChange={e => setEditingDevice({...editingDevice, devEui: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Nombre</label>
                    <input type="text" className="input-field" value={editingDevice.name} onChange={e => setEditingDevice({...editingDevice, name: e.target.value})} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Tipo</label>
                    <select className="input-field" value={editingDevice.type} onChange={e => setEditingDevice({...editingDevice, type: e.target.value as DeviceType})} required>
                      <option value="VALVULA">Válvula</option>
                      <option value="POZO">Pozo</option>
                      <option value="REBOMBEO">Rebombeo</option>
                      <option value="MEDIDOR">Medidor</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Dueño</label>
                    <select className="input-field" value={editingDevice.ownerId} onChange={e => setEditingDevice({...editingDevice, ownerId: e.target.value})} required>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Grupo / Sección</label>
                    <input type="text" className="input-field" placeholder="Sección Norte" value={editingDevice.group || ""} onChange={e => setEditingDevice({...editingDevice, group: e.target.value})} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? "Guardando..." : "Guardar"}
                    </button>
                    <button type="button" className={styles.actionBtn} onClick={() => setEditingDevice(null)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            {/* Tabla Nodos */}
            <div className={`glass-panel ${styles.tableContainer}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>DevEUI</th>
                    <th>Nombre</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Grupo</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(device => (
                    <tr key={device.devEui}>
                      <td><code className={styles.code}>{device.devEui.slice(-6)}</code></td>
                      <td><strong>{device.name}</strong></td>
                      <td>{getClientName(device.ownerId)}</td>
                      <td>{device.type}</td>
                      <td>{device.group || "—"}</td>
                      <td>
                        {device.type === "MEDIDOR" ? (
                          <span style={{color: "#0ea5e9", fontWeight: "bold"}}>Consumo: {device.consumo ?? 0} M³</span>
                        ) : (
                          <span className={device.status === "ON" ? styles.statusOn : styles.statusOff}>{device.status}</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                          {device.type !== "MEDIDOR" && (
                            <button
                              className={`btn-primary ${device.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                              onClick={() => handleToggleDevice(device.devEui, device.status)}
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                            >
                              {device.status === "ON" ? "Apagar" : "Encender"}
                            </button>
                          )}
                          <button className={styles.actionBtn} onClick={() => { setEditingDevice(device); setOriginalDevEui(device.devEui); setShowDeviceForm(false); }}>Editar</button>
                          <button className={styles.deleteBtnSmall} onClick={() => handleDeleteDevice(device.devEui, device.name)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {devices.length === 0 && !loading && <tr><td colSpan={7}>No hay nodos</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
