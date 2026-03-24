import { User, ClientInfo, Device } from "../types/models";

// Simulación de colecciones de Firestore
const users: User[] = [
  { uid: "admin_uid", email: "hiram@hidrogo.com", role: "SUPER_ADMIN" },
  { uid: "client_1", email: "contacto@elsol.com", role: "CLIENT", clientId: "c_123" },
];

const clients: ClientInfo[] = [
  { id: "c_123", name: "Rancho El Sol", email: "contacto@elsol.com" }
];

let devices: Device[] = [
  { devEui: "A840410001810001", name: "Pozo Norte", type: "POZO", status: "ON", ownerId: "c_123" },
  { devEui: "A840410001810002", name: "Válvula Sector 1", type: "VALVULA", status: "OFF", ownerId: "c_123" }
];

// Servicios MOCK
export const dbService = {
  // Autenticación mockeada
  authenticate: async (email: string) => {
    // Simular latencia de red
    return new Promise<User | null>((resolve) => {
      setTimeout(() => {
        resolve(users.find(u => u.email === email) || null);
      }, 800);
    });
  },

  // Funciones SUPER ADMIN
  getAllClients: async () => {
    return [...clients];
  },
  
  getAllDevices: async () => {
    return [...devices];
  },
  
  // Funciones CLIENTE (Con Filtro de Seguridad Multitenant)
  getClientDevices: async (clientId: string) => {
    return devices.filter(d => d.ownerId === clientId);
  },

  // Función para simular un toggle de estado (ON/OFF)
  toggleDeviceStatus: async (devEui: string, currentStatus: string) => {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        devices = devices.map(d => {
          if (d.devEui === devEui) {
            return { ...d, status: currentStatus === "ON" ? "OFF" : "ON" };
          }
          return d;
        });
        resolve(true);
      }, 500);
    });
  }
};
