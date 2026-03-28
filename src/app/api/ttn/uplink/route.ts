import { NextResponse } from 'next/server';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';

// Webhook TTN → Recibe datos de nodos LoRaWAN (EM300-DI, UC300, UC511)
export async function POST(request: Request) {
  try {
    // Verificar token secreto del webhook (configurar TTN_WEBHOOK_SECRET en Vercel)
    const webhookSecret = process.env.TTN_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${webhookSecret}`) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }
    }

    const ttnData = await request.json();

    const devEui = ttnData.end_device_ids?.dev_eui;
    const decodedPayload = ttnData.uplink_message?.decoded_payload;

    if (!devEui || !decodedPayload) {
      return NextResponse.json({ error: 'Payload Incompleto' }, { status: 400 });
    }

    // ─── A) Nodo MEDIDOR (EM300-DI) ────────────────────────────
    // El Payload Formatter de TTN entrega: { battery, humidity, temperature, pulses }
    // "pulses" ya representa el volumen de agua procesado.
    if (decodedPayload.pulses !== undefined) {
      const consumo = Number(decodedPayload.pulses);
      const battery = Number(decodedPayload.battery ?? 0);
      const humidity = Number(decodedPayload.humidity ?? 0);
      const temperature = Number(decodedPayload.temperature ?? 0);

      // 1. Actualizar el dispositivo con el consumo más reciente
      const deviceRef = doc(db, "devices", devEui);
      await updateDoc(deviceRef, {
        consumo,
        lastUplink: new Date().toISOString()
      });

      // 2. Guardar registro detallado en la colección consumo_logs
      await addDoc(collection(db, "consumo_logs"), {
        devEui,
        consumo,
        battery,
        humidity,
        temperature,
        timestamp: serverTimestamp()
      });

      return NextResponse.json({ success: true, type: 'MEDIDOR', consumo }, { status: 200 });
    }

    // ─── B) Nodo CONTROL (UC300 / UC511 – Pozos y Válvulas) ────
    let newStatus = 'OFF';
    if (decodedPayload.valve_1 === 'open' || decodedPayload.motor === 'on' || decodedPayload.status === 1) {
      newStatus = 'ON';
    }

    // Actualizar estado del dispositivo
    const deviceRef = doc(db, "devices", devEui);
    await updateDoc(deviceRef, {
      status: newStatus,
      lastUplink: new Date().toISOString()
    });

    // Guardar en history_logs
    await addDoc(collection(db, "history_logs"), {
      devEui,
      status: newStatus,
      payload: decodedPayload,
      timestamp: serverTimestamp()
    });

    return NextResponse.json({ success: true, type: 'CONTROL', status: newStatus }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Error del Servidor' }, { status: 500 });
  }
}
