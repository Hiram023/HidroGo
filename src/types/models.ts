export type Role = "SUPER_ADMIN" | "CLIENT";

export type User = {
  uid: string;
  email: string;
  role: Role;
  clientId?: string; // Solo los CLIENT tienen esto para filtrar datos
};

export type ClientInfo = {
  id: string; // client_id
  name: string;
  email: string;
  devEui?: string;
  valves?: number;
};

export type DeviceType = "POZO" | "VALVULA";
export type DeviceState = "ON" | "OFF";

export type Device = {
  devEui: string;
  name: string;
  type: DeviceType;
  status: DeviceState;
  ownerId: string; // ID del cliente dueño (client_id)
  lastUplink?: string; // Timestamp ISO 8601 del último reporte TTN
};
