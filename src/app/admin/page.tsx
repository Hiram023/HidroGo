"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import styles from "./admin.module.css";
import dashStyles from "../dashboard/dashboard.module.css";
import { dbService } from "../../services/dbReal";
import { Device, DeviceType, ConsumoLog } from "../../types/models";
import FlowRateChart from "../../components/FlowRateChart";

type Client = { id: string; name: string; email: string; devEui?: string; valves?: number; };

export default function AdminDashboard() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth protection
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // Sidebar state
  const [activeView, setActiveView] = useState<"clients" | "devices" | "mirror">("clients");
  const [clientsMenuOpen, setClientsMenuOpen] = useState(false);
  const [mirrorClientId, setMirrorClientId] = useState<string | null>(null);
  const [mirrorLogs, setMirrorLogs] = useState<ConsumoLog[]>([]);

  // Forms
  const [showClientForm, setShowClientForm] = useState(false);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{text: string, type: "error"|"success"}|null>(null);

  const [newClient, setNewClient] = useState({ name: "", email: "", devEui: "", password: "" });
  const [newDevice, setNewDevice] = useState({ devEui: "", name: "", type: "VALVULA" as DeviceType, ownerId: "", group: "" });
  const [editingClient, setEditingClient] = useState<Client|null>(null);
  const [editingDevice, setEditingDevice] = useState<Device|null>(null);
  const [originalDevEui, setOriginalDevEui] = useState("");

  // ─── Auth verification: must be SUPER_ADMIN ──────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        router.push("/login");
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (!userDoc.exists() || userDoc.data().role !== "SUPER_ADMIN") {
          router.push("/login");
          return;
        }
        setAuthorized(true);
      } catch (err) {
        console.error("Error verificando rol:", err);
        router.push("/login");
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (authorized) loadData();
  }, [authorized]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([dbService.getAllClients(), dbService.getAllDevices()]);
      setClients(c as Client[]);
      setDevices(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // ─── Vista Espejo ─────────────────────────────────────────
  const openMirrorView = async (clientId: string) => {
    setMirrorClientId(clientId);
    setActiveView("mirror");
    setShowClientForm(false);
    setShowDeviceForm(false);
    setEditingClient(null);
    setEditingDevice(null);
    try {
      const logs = await dbService.getConsumoLogs(clientId);
      setMirrorLogs(logs);
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => { await dbService.signOut(); router.push("/login"); };

  // ─── CRUD Clientes ────────────────────────────────────────
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true); setMessage(null);
    const result = await dbService.createClientUser(newClient.name, newClient.email, newClient.devEui, newClient.password || undefined);
    if (result.success) {
      setMessage({ text: `Cliente creado. Contraseña: ${result.tempPassword}`, type: "success" });
      setNewClient({ name: "", email: "", devEui: "", password: "" });
      setShowClientForm(false);
      loadData();
      alert(`Cliente Registrado\nCorreo: ${newClient.email}\nContraseña: ${result.tempPassword}`);
    } else { setMessage({ text: `Error: ${result.error}`, type: "error" }); }
    setIsSubmitting(false);
  };

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setIsSubmitting(true);
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      await updateDoc(doc(db, "clients", editingClient.id), { name: editingClient.name, email: editingClient.email });
      await updateDoc(doc(db, "users", editingClient.id), { email: editingClient.email });
      setMessage({ text: "Cliente actualizado", type: "success" });
      setEditingClient(null);
      loadData();
    } catch (error: any) { setMessage({ text: `Error: ${error.message}`, type: "error" }); }
    setIsSubmitting(false);
  };

  const handleDeleteClient = async (clientId: string, clientName: string) => {
    if (!confirm(`¿Eliminar al cliente "${clientName}" y todos sus nodos?`)) return;
    try {
      const { doc, deleteDoc, collection, query, where, getDocs } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      const devQ = query(collection(db, "devices"), where("ownerId", "==", clientId));
      const devSnap = await getDocs(devQ);
      for (const d of devSnap.docs) { await deleteDoc(d.ref); }
      await deleteDoc(doc(db, "clients", clientId));
      await deleteDoc(doc(db, "users", clientId));
      setMessage({ text: `Cliente "${clientName}" eliminado`, type: "success" });
      if (mirrorClientId === clientId) { setActiveView("clients"); setMirrorClientId(null); }
      loadData();
    } catch (error: any) { setMessage({ text: `Error: ${error.message}`, type: "error" }); }
  };

  // ─── CRUD Nodos ───────────────────────────────────────────
  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      const deviceData: any = { name: newDevice.name, type: newDevice.type, status: "OFF", ownerId: newDevice.ownerId };
      if (newDevice.type === "MEDIDOR") deviceData.consumo = 0;
      if (newDevice.group.trim()) deviceData.group = newDevice.group.trim();
      await setDoc(doc(db, "devices", newDevice.devEui), deviceData);
      setMessage({ text: `Nodo ${newDevice.devEui} registrado`, type: "success" });
      setNewDevice({ devEui: "", name: "", type: "VALVULA", ownerId: "", group: "" });
      setShowDeviceForm(false);
      loadData();
    } catch (error: any) { setMessage({ text: `Error: ${error.message}`, type: "error" }); }
    setIsSubmitting(false);
  };

  const handleEditDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;
    setIsSubmitting(true);
    try {
      const { doc, setDoc, deleteDoc, getDoc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      const newEui = editingDevice.devEui.trim();
      const updateData: any = { name: editingDevice.name, type: editingDevice.type, ownerId: editingDevice.ownerId, status: editingDevice.status || "OFF" };
      if (editingDevice.group !== undefined) updateData.group = editingDevice.group || null;
      if (editingDevice.consumo !== undefined) updateData.consumo = editingDevice.consumo;

      if (newEui !== originalDevEui) {
        const oldSnap = await getDoc(doc(db, "devices", originalDevEui));
        const oldData = oldSnap.exists() ? oldSnap.data() : {};
        await setDoc(doc(db, "devices", newEui), { ...oldData, ...updateData });
        await deleteDoc(doc(db, "devices", originalDevEui));
        setMessage({ text: `DevEUI migrado a ${newEui}`, type: "success" });
      } else {
        await updateDoc(doc(db, "devices", newEui), updateData);
        setMessage({ text: "Nodo actualizado", type: "success" });
      }
      setEditingDevice(null); setOriginalDevEui("");
      loadData();
    } catch (error: any) { setMessage({ text: `Error: ${error.message}`, type: "error" }); }
    setIsSubmitting(false);
  };

  const handleDeleteDevice = async (devEui: string, name: string) => {
    if (!confirm(`¿Eliminar el nodo "${name}" (${devEui})?`)) return;
    try {
      const { doc, deleteDoc } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase");
      await deleteDoc(doc(db, "devices", devEui));
      setMessage({ text: `Nodo "${name}" eliminado`, type: "success" });
      loadData();
    } catch (error: any) { setMessage({ text: `Error: ${error.message}`, type: "error" }); }
  };

  const handleToggleDevice = async (devEui: string, currentStatus: string) => {
    setDevices(prev => prev.map(d => d.devEui === devEui ? { ...d, status: currentStatus === "ON" ? "OFF" : "ON" } as Device : d));
    try {
      await fetch('/api/ttn/downlink', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devEui, command: currentStatus === "ON" ? "OFF" : "ON" })
      });
      await dbService.toggleDeviceStatus(devEui, currentStatus);
    } catch (err) {
      setDevices(prev => prev.map(d => d.devEui === devEui ? { ...d, status: currentStatus } as Device : d));
    }
  };

  const getClientName = (ownerId: string) => clients.find(c => c.id === ownerId)?.name || ownerId.slice(0, 8);
  const getDeviceName = (devEui: string) => devices.find(d => d.devEui === devEui)?.name || devEui.slice(-6);

  const mirrorClient = clients.find(c => c.id === mirrorClientId);
  const mirrorDevices = devices.filter(d => d.ownerId === mirrorClientId);
  const mirrorMedidores = mirrorDevices.filter(d => d.type === "MEDIDOR");
  const mirrorPozos = mirrorDevices.filter(d => d.type === "POZO");
  const mirrorRebombeos = mirrorDevices.filter(d => d.type === "REBOMBEO");
  const mirrorValvulas = mirrorDevices.filter(d => d.type === "VALVULA");
  const mirrorConsumoTotal = mirrorMedidores.reduce((acc, d) => acc + (d.consumo ?? 0), 0);

  // Grupos de válvulas en vista espejo
  const mValvulaGroups: Record<string, Device[]> = {};
  const mValvulasSinGrupo: Device[] = [];
  mirrorValvulas.forEach(v => {
    if (v.group) {
      if (!mValvulaGroups[v.group]) mValvulaGroups[v.group] = [];
      mValvulaGroups[v.group].push(v);
    } else { mValvulasSinGrupo.push(v); }
  });

  const handleToggleGroupMirror = async (groupName: string, action: "ON" | "OFF") => {
    const groupDevices = mirrorValvulas.filter(d => d.group === groupName);
    setDevices(prev => prev.map(d => d.group === groupName && d.type === "VALVULA" && d.ownerId === mirrorClientId ? { ...d, status: action } as Device : d));
    for (const dev of groupDevices) {
      try {
        await fetch('/api/ttn/downlink', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.NEXT_PUBLIC_DOWNLINK_SECRET || '' }, body: JSON.stringify({ devEui: dev.devEui, command: action }) });
        await dbService.toggleDeviceStatus(dev.devEui, dev.status);
      } catch {}
    }
  };

  const exportCSV = (logs: ConsumoLog[]) => {
    if (logs.length === 0) { alert("No hay datos."); return; }
    const MAX_INT = 65 * 60;
    const headers = ["Fecha y Hora", "Medidor", "Consumo (m3)", "Caudal (l/s)", "Bateria (%)", "Humedad (%)", "Temperatura (C)"];
    const sortedLogs = [...logs].sort((a, b) => {
      const ta = a.timestamp?.toDate?.() || new Date(0);
      const tb = b.timestamp?.toDate?.() || new Date(0);
      return ta.getTime() - tb.getTime();
    });
    const rows = sortedLogs.map((log, idx) => {
      const fecha = log.timestamp?.toDate?.() ? log.timestamp.toDate().toLocaleString("es-MX") : "";
      let caudal = 0;
      if (idx > 0 && sortedLogs[idx - 1].devEui === log.devEui) {
        const prev = sortedLogs[idx - 1];
        const delta = log.consumo - prev.consumo;
        const d0 = log.timestamp?.toDate?.() || new Date(0);
        const d1 = prev.timestamp?.toDate?.() || new Date(0);
        const intSec = (d0.getTime() - d1.getTime()) / 1000;
        caudal = (intSec > MAX_INT || intSec <= 0 || delta < 0) ? 0 : (delta === 0 ? 0 : Number(((delta * 1000) / intSec).toFixed(1)));
      }
      return [fecha, getDeviceName(log.devEui), log.consumo, caudal, log.battery ?? "", log.humidity ?? "", log.temperature ?? ""];
    });
    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RiegoSon_Consumo_${mirrorClient?.name || "export"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", color: "var(--primary)", background: "var(--bg-primary)" }}>Verificando acceso...</div>;
  if (!authorized) return null;

  return (
    <div className={styles.adminLayout}>
      {/* ═══════ SIDEBAR ═══════ */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h2>RiegoSon</h2>
          <span>Control Maestro</span>
        </div>
        <nav className={styles.nav}>
          {/* Gestión de Clientes — Acordeón */}
          <a href="#" className={activeView === "clients" ? styles.active : ""}
            onClick={(e) => { e.preventDefault(); setClientsMenuOpen(!clientsMenuOpen); setActiveView("clients"); setMirrorClientId(null); }}>
            {clientsMenuOpen ? "▼" : "▶"} Gestión de Clientes
          </a>
          {clientsMenuOpen && (
            <>
              <span className={styles.submenuToggle}>CLIENTES REGISTRADOS ({clients.length})</span>
              <div className={styles.submenu}>
                {clients.map(c => (
                  <a key={c.id} href="#"
                    className={mirrorClientId === c.id ? styles.submenuActive : ""}
                    onClick={() => openMirrorView(c.id)}>
                    {c.name}
                  </a>
                ))}
                {clients.length === 0 && <span className={styles.submenuEmpty}>Sin clientes</span>}
              </div>
            </>
          )}

          <a href="#" className={activeView === "devices" ? styles.active : ""}
            onClick={() => { setActiveView("devices"); setMirrorClientId(null); }}>
            Nodos Globales (IoT)
          </a>
        </nav>
        <button className={styles.logoutBtn} onClick={handleLogout}>Cerrar Sesión</button>
      </aside>

      {/* ═══════ MAIN CONTENT ═══════ */}
      <main className={styles.mainContent}>
        {message && (
          <div style={{ padding: "0.8rem 1rem", marginBottom: "1rem", borderRadius: "8px",
            background: message.type === "success" ? "#dcfce7" : "#fee2e2",
            color: message.type === "success" ? "#166534" : "#991b1b", fontSize: "0.9rem" }}>
            {message.text}
          </div>
        )}

        {/* ═══════ VISTA: GESTIÓN DE CLIENTES ═══════ */}
        {activeView === "clients" && (
          <>
            <header className={styles.header}>
              <h1>Panel de Clientes</h1>
              <button className="btn-primary" onClick={() => { setShowClientForm(!showClientForm); setEditingClient(null); }}>
                {showClientForm ? "Cancelar" : "+ Nuevo Cliente"}
              </button>
            </header>

            {showClientForm && !editingClient && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Alta de Nuevo Cliente</h2>
                <form onSubmit={handleAddClient} className={styles.form}>
                  <div className={styles.formGroup}><label>Nombre del Rancho / Agrícola</label>
                    <input type="text" className="input-field" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} required /></div>
                  <div className={styles.formGroup}><label>Correo Electrónico (Login)</label>
                    <input type="email" className="input-field" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} required /></div>
                  <div className={styles.formGroup}><label>Contraseña (Vacío = RiegoSon2026*)</label>
                    <input type="text" className="input-field" placeholder="RiegoSon2026*" value={newClient.password} onChange={e => setNewClient({...newClient, password: e.target.value})} /></div>
                  <div className={styles.formGroup}><label>TTN DevEUI Inicial (Opcional)</label>
                    <input type="text" className="input-field" placeholder="A84041000181XXXX" value={newClient.devEui} onChange={e => setNewClient({...newClient, devEui: e.target.value})} /></div>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Creando..." : "Registrar Cliente"}</button>
                </form>
              </div>
            )}

            {editingClient && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Editar Cliente</h2>
                <form onSubmit={handleEditClient} className={styles.form}>
                  <div className={styles.formGroup}><label>Nombre</label>
                    <input type="text" className="input-field" value={editingClient.name} onChange={e => setEditingClient({...editingClient, name: e.target.value})} required /></div>
                  <div className={styles.formGroup}><label>Correo</label>
                    <input type="email" className="input-field" value={editingClient.email} onChange={e => setEditingClient({...editingClient, email: e.target.value})} required /></div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Guardando..." : "Guardar"}</button>
                    <button type="button" className={styles.actionBtn} onClick={() => setEditingClient(null)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            <div className={`glass-panel ${styles.tableContainer}`}>
              <table className={styles.table}>
                <thead><tr><th>Nombre</th><th>Correo</th><th>Nodos</th><th>Acciones</th></tr></thead>
                <tbody>
                  {clients.map(client => (
                    <tr key={client.id}>
                      <td><strong>{client.name}</strong></td>
                      <td>{client.email}</td>
                      <td>{devices.filter(d => d.ownerId === client.id).length} en red</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button className={styles.actionBtn} onClick={() => openMirrorView(client.id)}>Ver Panel</button>
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

        {/* ═══════ VISTA: NODOS GLOBALES ═══════ */}
        {activeView === "devices" && (
          <>
            <header className={styles.header}>
              <h1>Control de Nodos IoT</h1>
              <button className="btn-primary" onClick={() => { setShowDeviceForm(!showDeviceForm); setEditingDevice(null); }}>
                {showDeviceForm ? "Cancelar" : "+ Asignar Nodo"}
              </button>
            </header>

            {showDeviceForm && !editingDevice && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Asignar Nuevo Nodo</h2>
                <form onSubmit={handleAddDevice} className={styles.form}>
                  <div className={styles.formGroup}><label>DevEUI de TTN</label>
                    <input type="text" className="input-field" placeholder="24E124128XXXX" value={newDevice.devEui} onChange={e => setNewDevice({...newDevice, devEui: e.target.value})} required /></div>
                  <div className={styles.formGroup}><label>Nombre Identificador</label>
                    <input type="text" className="input-field" placeholder="Medidor Pozo Norte" value={newDevice.name} onChange={e => setNewDevice({...newDevice, name: e.target.value})} required /></div>
                  <div className={styles.formGroup}><label>Tipo de Hardware</label>
                    <select className="input-field" value={newDevice.type} onChange={e => setNewDevice({...newDevice, type: e.target.value as DeviceType})} required>
                      <option value="VALVULA">Válvula (UC300/UC511)</option>
                      <option value="POZO">Bomba de Pozo (Relé UC300)</option>
                      <option value="REBOMBEO">Rebombeo (Relé UC300)</option>
                      <option value="MEDIDOR">Medidor Consumo (EM300-DI)</option>
                    </select></div>
                  <div className={styles.formGroup}><label>Asignar al Cliente</label>
                    <select className="input-field" value={newDevice.ownerId} onChange={e => setNewDevice({...newDevice, ownerId: e.target.value})} required>
                      <option value="">Seleccione dueño...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select></div>
                  <div className={styles.formGroup}><label>Grupo / Sección (Opcional)</label>
                    <input type="text" className="input-field" placeholder="Ej: Sección Norte" value={newDevice.group} onChange={e => setNewDevice({...newDevice, group: e.target.value})} /></div>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Registrando..." : "Añadir a la Red"}</button>
                </form>
              </div>
            )}

            {editingDevice && (
              <div className={`glass-panel ${styles.formContainer}`}>
                <h2>Editar Nodo</h2>
                <form onSubmit={handleEditDevice} className={styles.form}>
                  <div className={styles.formGroup}><label>DevEUI</label>
                    <input type="text" className="input-field" value={editingDevice.devEui} onChange={e => setEditingDevice({...editingDevice, devEui: e.target.value})} required /></div>
                  <div className={styles.formGroup}><label>Nombre</label>
                    <input type="text" className="input-field" value={editingDevice.name} onChange={e => setEditingDevice({...editingDevice, name: e.target.value})} required /></div>
                  <div className={styles.formGroup}><label>Tipo</label>
                    <select className="input-field" value={editingDevice.type} onChange={e => setEditingDevice({...editingDevice, type: e.target.value as DeviceType})} required>
                      <option value="VALVULA">Válvula</option><option value="POZO">Pozo</option>
                      <option value="REBOMBEO">Rebombeo</option><option value="MEDIDOR">Medidor</option>
                    </select></div>
                  <div className={styles.formGroup}><label>Dueño</label>
                    <select className="input-field" value={editingDevice.ownerId} onChange={e => setEditingDevice({...editingDevice, ownerId: e.target.value})} required>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select></div>
                  <div className={styles.formGroup}><label>Grupo / Sección</label>
                    <input type="text" className="input-field" placeholder="Sección Norte" value={editingDevice.group || ""} onChange={e => setEditingDevice({...editingDevice, group: e.target.value})} /></div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Guardando..." : "Guardar"}</button>
                    <button type="button" className={styles.actionBtn} onClick={() => setEditingDevice(null)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            <div className={`glass-panel ${styles.tableContainer}`}>
              <table className={styles.table}>
                <thead><tr><th>DevEUI</th><th>Nombre</th><th>Cliente</th><th>Tipo</th><th>Grupo</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {devices.map(device => (
                    <tr key={device.devEui}>
                      <td><code className={styles.code}>{device.devEui.slice(-6)}</code></td>
                      <td><strong>{device.name}</strong></td>
                      <td>{getClientName(device.ownerId)}</td>
                      <td>{device.type}</td>
                      <td>{device.group || "—"}</td>
                      <td>{device.type === "MEDIDOR"
                        ? <span style={{color:"#0ea5e9",fontWeight:"bold"}}>Consumo: {(device.consumo ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³</span>
                        : <span className={device.status === "ON" ? styles.statusOn : styles.statusOff}>{device.status}</span>}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                          {device.type !== "MEDIDOR" && (
                            <button className={`btn-primary ${device.status === "ON" ? styles.btnDanger : styles.btnSuccess}`}
                              onClick={() => handleToggleDevice(device.devEui, device.status)}
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                              {device.status === "ON" ? "Apagar" : "Encender"}
                            </button>)}
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

        {/* ═══════ VISTA ESPEJO (Dashboard del Cliente) ═══════ */}
        {activeView === "mirror" && mirrorClient && (
          <>
            <header className={styles.header}>
              <div>
                <h1>{mirrorClient.name}</h1>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{mirrorClient.email} — Vista Espejo del Super Admin</span>
              </div>
            </header>

            {/* 1. Consumo Total */}
            {mirrorMedidores.length > 0 && (
              <section className={dashStyles.consumoSection}>
                <div className={`glass-panel ${dashStyles.consumoCard}`}>
                  <div className={dashStyles.consumoData}>
                    <span className={dashStyles.consumoLabel}>Consumo Total Actual</span>
                    <span className={dashStyles.consumoValue}>{Math.round(mirrorConsumoTotal / 1000)} Mm³</span>
                  </div>
                  <div className={dashStyles.consumoMeta}><span>{mirrorMedidores.length} medidor{mirrorMedidores.length > 1 ? "es" : ""}</span></div>
                </div>
              </section>
            )}

            {/* Medidores + Gráficas */}
            {mirrorMedidores.map(m => (
              <section key={m.devEui} className={dashStyles.medidorSection}>
                <div className={`glass-panel ${dashStyles.medidorCard}`}>
                  <div className={dashStyles.medidorInfo}>
                    <span className={dashStyles.medidorName}>{m.name}</span>
                    <span className={dashStyles.medidorValue}>{(m.consumo ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³</span>
                  </div>
                  <div className={dashStyles.adminActions}>
                    <button className={dashStyles.editBtn} onClick={() => { setEditingDevice(m); setOriginalDevEui(m.devEui); setActiveView("devices"); }}>Editar</button>
                    <button className={dashStyles.deleteBtn} onClick={() => handleDeleteDevice(m.devEui, m.name)}>Eliminar</button>
                  </div>
                </div>
                <FlowRateChart devEui={m.devEui} deviceName={m.name} />
              </section>
            ))}

            {/* 2. Pozos */}
            {mirrorPozos.length > 0 && (
              <section className={dashStyles.opsSection}>
                <h2 className={dashStyles.sectionTitle}>Pozos</h2>
                <div className={dashStyles.devicesGrid}>
                  {mirrorPozos.map(d => (
                    <div key={d.devEui} className={`glass-panel ${dashStyles.deviceCard}`}>
                      <div className={dashStyles.cardHeader}>
                        <h3>{d.name}</h3>
                        <span className={`${dashStyles.statusBadge} ${d.status === "ON" ? dashStyles.statusOn : dashStyles.statusOff}`}>{d.status}</span>
                      </div>
                      <div className={dashStyles.cardAction}>
                        <button className={`btn-primary ${dashStyles.actionBtn} ${d.status === "ON" ? dashStyles.btnDanger : dashStyles.btnSuccess}`}
                          onClick={() => handleToggleDevice(d.devEui, d.status)}>
                          {d.status === "ON" ? "Apagar Motor" : "Encender Motor"}</button>
                      </div>
                      <div className={dashStyles.adminActions}>
                        <button className={dashStyles.editBtn} onClick={() => { setEditingDevice(d); setOriginalDevEui(d.devEui); setActiveView("devices"); }}>Editar</button>
                        <button className={dashStyles.deleteBtn} onClick={() => handleDeleteDevice(d.devEui, d.name)}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Rebombeos */}
            {mirrorRebombeos.length > 0 && (
              <section className={dashStyles.opsSection}>
                <h2 className={dashStyles.sectionTitle}>Rebombeo</h2>
                <div className={dashStyles.devicesGrid}>
                  {mirrorRebombeos.map(d => (
                    <div key={d.devEui} className={`glass-panel ${dashStyles.deviceCard}`}>
                      <div className={dashStyles.cardHeader}>
                        <h3>{d.name}</h3>
                        <span className={`${dashStyles.statusBadge} ${d.status === "ON" ? dashStyles.statusOn : dashStyles.statusOff}`}>{d.status}</span>
                      </div>
                      <div className={dashStyles.cardAction}>
                        <button className={`btn-primary ${dashStyles.actionBtn} ${d.status === "ON" ? dashStyles.btnDanger : dashStyles.btnSuccess}`}
                          onClick={() => handleToggleDevice(d.devEui, d.status)}>
                          {d.status === "ON" ? "Apagar Rebombeo" : "Encender Rebombeo"}</button>
                      </div>
                      <div className={dashStyles.adminActions}>
                        <button className={dashStyles.editBtn} onClick={() => { setEditingDevice(d); setOriginalDevEui(d.devEui); setActiveView("devices"); }}>Editar</button>
                        <button className={dashStyles.deleteBtn} onClick={() => handleDeleteDevice(d.devEui, d.name)}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. Válvulas por sección */}
            {Object.keys(mValvulaGroups).length > 0 && (
              <section className={dashStyles.opsSection}>
                <h2 className={dashStyles.sectionTitle}>Válvulas por Sección</h2>
                {Object.entries(mValvulaGroups).map(([groupName, groupValves]) => (
                  <div key={groupName} className={`glass-panel ${dashStyles.valveGroup}`}>
                    <div className={dashStyles.groupHeader}>
                      <h3>{groupName}</h3>
                      <div className={dashStyles.groupActions}>
                        <button className={`btn-primary ${dashStyles.btnSuccess}`} style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}
                          onClick={() => handleToggleGroupMirror(groupName, "ON")}>Abrir Todas</button>
                        <button className={`btn-primary ${dashStyles.btnDanger}`} style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}
                          onClick={() => handleToggleGroupMirror(groupName, "OFF")}>Cerrar Todas</button>
                      </div>
                    </div>
                    <div className={dashStyles.groupValves}>
                      {groupValves.map(v => (
                        <div key={v.devEui} className={dashStyles.valveItem}>
                          <span className={dashStyles.valveName}>{v.name}</span>
                          <span className={`${dashStyles.statusBadge} ${v.status === "ON" ? dashStyles.statusOn : dashStyles.statusOff}`}>{v.status}</span>
                          <button className={`btn-primary ${v.status === "ON" ? dashStyles.btnDanger : dashStyles.btnSuccess}`}
                            style={{ padding: "0.3rem 0.8rem", fontSize: "0.75rem" }}
                            onClick={() => handleToggleDevice(v.devEui, v.status)}>
                            {v.status === "ON" ? "Cerrar" : "Abrir"}</button>
                          <button className={dashStyles.deleteBtn} style={{ marginLeft: "auto" }} onClick={() => handleDeleteDevice(v.devEui, v.name)}>Eliminar</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* 5. Válvulas individuales */}
            {mValvulasSinGrupo.length > 0 && (
              <section className={dashStyles.opsSection}>
                <h2 className={dashStyles.sectionTitle}>Válvulas Individuales</h2>
                <div className={dashStyles.devicesGrid}>
                  {mValvulasSinGrupo.map(d => (
                    <div key={d.devEui} className={`glass-panel ${dashStyles.deviceCard}`}>
                      <div className={dashStyles.cardHeader}>
                        <h3>{d.name}</h3>
                        <span className={`${dashStyles.statusBadge} ${d.status === "ON" ? dashStyles.statusOn : dashStyles.statusOff}`}>{d.status}</span>
                      </div>
                      <div className={dashStyles.cardAction}>
                        <button className={`btn-primary ${dashStyles.actionBtn} ${d.status === "ON" ? dashStyles.btnDanger : dashStyles.btnSuccess}`}
                          onClick={() => handleToggleDevice(d.devEui, d.status)}>
                          {d.status === "ON" ? "Cerrar Válvula" : "Abrir Válvula"}</button>
                      </div>
                      <div className={dashStyles.adminActions}>
                        <button className={dashStyles.editBtn} onClick={() => { setEditingDevice(d); setOriginalDevEui(d.devEui); setActiveView("devices"); }}>Editar</button>
                        <button className={dashStyles.deleteBtn} onClick={() => handleDeleteDevice(d.devEui, d.name)}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 6. Tabla histórica */}
            <section className={dashStyles.historySection}>
              <div className={dashStyles.historyHeader}>
                <h2>Registro Histórico de Consumo</h2>
                <button className="btn-primary" onClick={() => exportCSV(mirrorLogs)} style={{ fontSize: "0.85rem", padding: "0.5rem 1.2rem" }}>Exportar CSV</button>
              </div>
              <div className={`glass-panel ${dashStyles.tableContainer}`}>
                <table className={dashStyles.historyTable}>
                  <thead><tr><th>Fecha y Hora</th><th>Medidor</th><th>Consumo</th><th>Batería</th><th>Humedad</th><th>Temperatura</th></tr></thead>
                  <tbody>
                    {mirrorLogs.map((log, idx) => {
                      const fecha = log.timestamp?.toDate?.()
                        ? log.timestamp.toDate().toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
                      return (
                        <tr key={log.id || idx}>
                          <td>{fecha}</td>
                          <td><strong>{getDeviceName(log.devEui)}</strong></td>
                          <td><strong className={dashStyles.consumoCell}>{log.consumo}</strong></td>
                          <td>{log.battery != null ? `${log.battery}%` : "—"}</td>
                          <td>{log.humidity != null ? `${log.humidity}%` : "—"}</td>
                          <td>{log.temperature != null ? `${log.temperature}°C` : "—"}</td>
                        </tr>);
                    })}
                    {mirrorLogs.length === 0 && (
                      <tr><td colSpan={6} className={dashStyles.emptyRow}>Sin registros de consumo para este cliente.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>

            {mirrorDevices.length === 0 && (
              <div className={dashStyles.noDevices}><p>Este cliente no tiene nodos asignados.</p></div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
