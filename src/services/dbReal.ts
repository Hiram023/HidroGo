import { auth, db } from "../lib/firebase";
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
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
  }
};
