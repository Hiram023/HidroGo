export type Role = "SUPER_ADMIN" | "CLIENT";

export type User = {
  uid: string;
  email: string;
  role: Role;
  clientId?: string;
  mustChangePassword?: boolean;
};

export type ClientInfo = {
  id: string;
  name: string;
  email: string;
  devEui?: string;
  valves?: number;
};

export type DeviceType = "POZO" | "VALVULA" | "MEDIDOR" | "REBOMBEO";
export type DeviceState = "ON" | "OFF";

export type Device = {
  devEui: string;
  name: string;
  type: DeviceType;
  status: DeviceState;
  ownerId: string;
  consumo?: number;        // Metros cúbicos acumulados (solo MEDIDOR)
  lastUplink?: string;     // ISO 8601
  group?: string;          // Agrupación para válvulas (ej: "Sección Norte")
};

export type ConsumoLog = {
  id?: string;
  devEui: string;
  consumo: number;
  battery?: number;
  humidity?: number;
  temperature?: number;
  timestamp: any;
};
