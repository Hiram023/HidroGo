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

export type DeviceType = "POZO" | "VALVULA" | "MEDIDOR";
export type DeviceState = "ON" | "OFF";

export type Device = {
  devEui: string;
  name: string;
  type: DeviceType;
  status: DeviceState;
  ownerId: string;
  consumo?: number;       // Metros cúbicos acumulados (solo MEDIDOR)
  lastUplink?: string;    // ISO 8601
};

// Registro individual de telemetría del EM300-DI
export type ConsumoLog = {
  id?: string;
  devEui: string;
  consumo: number;         // Valor de "pulses" (ya en volumen procesado)
  battery?: number;
  humidity?: number;
  temperature?: number;
  timestamp: any;          // Firestore Timestamp o Date
};
