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

    // 3. Procesamiento especializado por tipo de Nodo
    let newStatus = 'OFF';
    let pulsosConteo = 0;

    // A) Lógica para Válvulas y Pozos (Milesight UC300 / UC511)
    if (decodedPayload.valve_1 === 'open' || decodedPayload.motor === 'on' || decodedPayload.status === 1) {
      newStatus = 'ON';
    }

    // B) Lógica para Medidores de Agua (Milesight EM300-DI u otros contadores de pulso)
    if (decodedPayload.counter !== undefined || decodedPayload.count !== undefined) {
      pulsosConteo = Number(decodedPayload.counter || decodedPayload.count || 0);
      newStatus = 'LECTURA';
      
      // Matemática: Supongamos que 1 pulso = 10 Litros (0.01 Metros Cúbicos)
      // Modificable según el medidor físico real
      const factorConversion = 0.01; 
      const consumoMetrosCubicos = pulsosConteo * factorConversion;
      
      console.log(`[TTN UPLINK - MEDIDOR] ${devEui} -> Pulsos: ${pulsosConteo} -> Consumo M3: ${consumoMetrosCubicos}`);
      await dbService.updateDeviceConsumo(devEui, consumoMetrosCubicos, decodedPayload);
    } else {
      // Si no es medidor, procesamos como ON/OFF normal
      console.log(`[TTN UPLINK - CONTROL] Recibido dato de nodo: ${devEui} - Nuevo estado: ${newStatus}`);
      await dbService.logDeviceHistory(devEui, newStatus, decodedPayload);
    }

    return NextResponse.json({ success: true, message: 'Estado e historial actualizado' }, { status: 200 });
  } catch (error) {
    console.error('Error procesando Webhook de TTN:', error);
    return NextResponse.json({ error: 'Error del Servidor' }, { status: 500 });
  }
}
