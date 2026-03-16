import { auth, db, firebaseConfig } from "../lib/firebase";
import { signInWithEmailAndPassword, signOut as firebaseSignOut, getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, addDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { User, ClientInfo, Device } from "../types/models";

export const dbService = {
  // Autenticación Real usando Firebase Auth y extrayendo rol de Firestore
  authenticate: async (email: string, password?: string) => {
    try {
      if (!password) throw new Error("Contraseña requerida");
      
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // Buscar si es Super Admin o Cliente en Firestore
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

  signOut: async () => {
    await firebaseSignOut(auth);
  },

  // Funciones SUPER ADMIN
  getAllClients: async () => {
    const querySnapshot = await getDocs(collection(db, "clients"));
    return querySnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as ClientInfo[];
  },
  
  getAllDevices: async () => {
    const querySnapshot = await getDocs(collection(db, "devices"));
    return querySnapshot.docs.map((doc: any) => ({ devEui: doc.id, ...doc.data() })) as Device[];
  },

  // Crear cliente (Usuario + Cliente Info + Dispositivo)
  createClientUser: async (name: string, email: string, devEui: string) => {
    try {
      // Usar Secondary App para no alterar la sesión del Super Admin
      const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      
      const tempPassword = "HidroGo2026*"; // Contraseña genérica MVP
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
      const uid = userCred.user.uid;
      
      await firebaseSignOut(secondaryAuth);
      await deleteApp(secondaryApp);

      // Ahora insertamos en DB con el Auth Principal (Super Admin)
      const clientId = uid; 

      // 1. Doc en 'users'
      await setDoc(doc(db, "users", uid), {
        email,
        role: "CLIENT",
        clientId
      });

      // 2. Doc en 'clients'
      await setDoc(doc(db, "clients", clientId), {
        name,
        email,
        valves: 1
      });

      // 3. Doc en 'devices'
      await setDoc(doc(db, "devices", devEui), {
        name: "Válvula 1",
        type: "VÁLVULA",
        status: "OFF",
        ownerId: clientId
      });

      return { success: true, tempPassword };
    } catch (error: any) {
      console.error("Error creando cliente completo:", error);
      return { success: false, error: error.message };
    }
  },
  
  // Funciones CLIENTE (Con Filtro Multitenant en DB)
  getClientDevices: async (clientId: string) => {
    const q = query(collection(db, "devices"), where("ownerId", "==", clientId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc: any) => ({ devEui: doc.id, ...doc.data() })) as Device[];
  },

  // Actualizar estado en Firebase Firestore
  toggleDeviceStatus: async (devEui: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "ON" ? "OFF" : "ON";
      const deviceRef = doc(db, "devices", devEui);
      await updateDoc(deviceRef, { status: newStatus });
      return true;
    } catch (error) {
      console.error("Error actualizando status:", error);
      return false;
    }
  },

  // Guardar log del mensaje recibido de TTN
  logDeviceHistory: async (devEui: string, status: string, fullPayload: any) => {
    try {
      await addDoc(collection(db, "history_logs"), {
        devEui,
        status,
        payload: fullPayload,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error("Error guardando historial:", error);
    }
  }
};
