import { NextResponse } from 'next/server';
import { dbService } from '../../../../services/dbReal';

// Este Endpoint será llamado por The Things Network cada vez que un sensor LoRa envíe datos (Uplink)
export async function POST(request: Request) {
  try {
    // 1. Obtener y parsear el payload enviado por TTN (Formato JSON)
    const ttnData = await request.json();

    // 2. Extraer datos útiles (Asumiendo formato estándar de TTS v3 payload formatter)
    const devEui = ttnData.end_device_ids?.dev_eui;
    const decodedPayload = ttnData.uplink_message?.decoded_payload;
    
    // Validar que tengamos datos
    if (!devEui || !decodedPayload) {
      return NextResponse.json({ error: 'Payload Incompleto' }, { status: 400 });
    }

    // 3. Procesar datos del Milesight UC300 o UC511
    // Supondremos que el payload decodificado trae un status tipo { "valve_1": "open" } o { "motor": "on" }
    // En una implementación real se mapearía según el catálogo de Milesight
    let newStatus = 'OFF';
    if (decodedPayload.valve_1 === 'open' || decodedPayload.motor === 'on' || decodedPayload.status === 1) {
      newStatus = 'ON';
    }

    // 4. Actualizar estado en la base de datos (En este caso usando el Mock, luego usaremos Firebase admin)
    // El sistema ya actualizará en tiempo real el registro según este DevEUI
    console.log(`[TTN UPLINK] Recibido dato de nodo: ${devEui} - Nuevo estado: ${newStatus}`);
    
    // (Llamada al servicio interno Mock o real)
    await dbService.toggleDeviceStatus(devEui, newStatus === 'ON' ? 'OFF' : 'ON'); // Forzamos un toggle simulado

    return NextResponse.json({ success: true, message: 'Estado del nodo actualizado en BD' }, { status: 200 });
  } catch (error) {
    console.error('Error procesando Webhook de TTN:', error);
    return NextResponse.json({ error: 'Error del Servidor' }, { status: 500 });
  }
}
