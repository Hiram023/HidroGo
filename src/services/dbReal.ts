import { auth, db, firebaseConfig } from "../lib/firebase";
import { signInWithEmailAndPassword, signOut as firebaseSignOut, getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, addDoc, serverTimestamp, setDoc, orderBy, limit, Timestamp } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { User, ClientInfo, Device, ConsumoLog } from "../types/models";

export const dbService = {
  // ─── Autenticación ────────────────────────────────────────────
  authenticate: async (email: string, password?: string) => {
    try {
      if (!password) throw new Error("Contraseña requerida");
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        return { uid, email, ...userDoc.data() } as User;
      }
      return null;
    } catch (error: any) {
      console.error("Error en auth Firebase:", error.message);
      return null;
    }
  },

  signOut: async () => { await firebaseSignOut(auth); },

  // ─── Funciones SUPER ADMIN ────────────────────────────────────
  getAllClients: async () => {
    const querySnapshot = await getDocs(collection(db, "clients"));
    return querySnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() })) as ClientInfo[];
  },

  getAllDevices: async () => {
    const querySnapshot = await getDocs(collection(db, "devices"));
    return querySnapshot.docs.map((d: any) => ({ devEui: d.id, ...d.data() })) as Device[];
  },

  createClientUser: async (name: string, email: string, devEui: string, customPassword?: string) => {
    try {
      const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const password = customPassword || "RiegoSon2026*";
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = userCred.user.uid;
      await firebaseSignOut(secondaryAuth);
      await deleteApp(secondaryApp);

      const clientId = uid;
      await setDoc(doc(db, "users", uid), { email, role: "CLIENT", clientId, mustChangePassword: true });
      await setDoc(doc(db, "clients", clientId), { name, email, devEui, valves: 1 });

      if (devEui && devEui.trim() !== "") {
        await setDoc(doc(db, "devices", devEui), { name: "Dispositivo 1", type: "VALVULA", status: "OFF", ownerId: clientId });
      }

      return { success: true, tempPassword: password };
    } catch (error: any) {
      console.error("Error creando cliente completo:", error);
      return { success: false, error: error.message };
    }
  },

  // ─── Funciones CLIENTE (Multitenant) ──────────────────────────
  getClientDevices: async (clientId: string) => {
    const q = query(collection(db, "devices"), where("ownerId", "==", clientId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((d: any) => ({ devEui: d.id, ...d.data() })) as Device[];
  },

  // Logs de consumo para TODOS los medidores de un cliente
  getConsumoLogs: async (clientId: string, maxResults: number = 200) => {
    const devicesQ = query(collection(db, "devices"), where("ownerId", "==", clientId), where("type", "==", "MEDIDOR"));
    const devicesSnap = await getDocs(devicesQ);
    const medidorEuis = devicesSnap.docs.map(d => d.id);
    if (medidorEuis.length === 0) return [] as ConsumoLog[];

    const allLogs: ConsumoLog[] = [];
    for (const eui of medidorEuis) {
      const logsQ = query(collection(db, "consumo_logs"), where("devEui", "==", eui), orderBy("timestamp", "desc"), limit(maxResults));
      const logsSnap = await getDocs(logsQ);
      logsSnap.docs.forEach(d => { allLogs.push({ id: d.id, ...d.data() } as ConsumoLog); });
    }

    allLogs.sort((a, b) => {
      const ta = a.timestamp?.toDate?.() || new Date(0);
      const tb = b.timestamp?.toDate?.() || new Date(0);
      return tb.getTime() - ta.getTime();
    });
    return allLogs;
  },

  // Logs de consumo para UN medidor específico con filtro de tiempo
  getConsumoLogsByDevEui: async (devEui: string, daysBack: number = 3) => {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const sinceTimestamp = Timestamp.fromDate(since);

    const logsQ = query(
      collection(db, "consumo_logs"),
      where("devEui", "==", devEui),
      where("timestamp", ">=", sinceTimestamp),
      orderBy("timestamp", "asc")
    );
    const logsSnap = await getDocs(logsQ);
    return logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ConsumoLog));
  },

  // ─── Acciones de dispositivos ─────────────────────────────────
  toggleDeviceStatus: async (devEui: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "ON" ? "OFF" : "ON";
      await updateDoc(doc(db, "devices", devEui), { status: newStatus });
      return true;
    } catch (error) {
      console.error("Error actualizando status:", error);
      return false;
    }
  },

  logDeviceHistory: async (devEui: string, status: string, fullPayload: any) => {
    try {
      await addDoc(collection(db, "history_logs"), { devEui, status, payload: fullPayload, timestamp: serverTimestamp() });
    } catch (error) { console.error("Error guardando historial:", error); }
  }
};
