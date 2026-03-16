export type Role = "SUPER_ADMIN" | "CLIENT";

export type User = {
  uid: string;
  email: string;
  role: Role;
  clientId?: string;
  mustChangePassword?: boolean; // true = primer inicio, forzar cambio
};

export type ClientInfo = {
  id: string; // client_id
  name: string;
  email: string;
  devEui?: string;
  valves?: number;
};

export type DeviceType = "POZO" | "VALVULA" | "MEDIDOR";
export type DeviceState = "ON" | "OFF" | "LECTURA";

export type Device = {
  devEui: string;
  name: string;
  type: DeviceType;
  status: DeviceState;
  ownerId: string; // ID del cliente dueño (client_id)
  consumo?: number; // Metros cúbicos, sólo para tipo MEDIDOR
  lastUplink?: string; // Timestamp ISO 8601 del último reporte TTN
};
