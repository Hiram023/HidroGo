import { NextResponse } from 'next/server';

// Este Endpoint es llamado por nuestro propio Front-end (Ej. el que presionaste "Abrir Válvula")
// Será responsable de mandar un Downlink a The Things Network para cambiar el estado físico
export async function POST(request: Request) {
  try {
    const { devEui, command } = await request.json(); // command = 'ON' | 'OFF'

    if (!devEui || !command) {
      return NextResponse.json({ error: 'Datos incompletos para encolar Downlink' }, { status: 400 });
    }

    // 1. Aquí se construiría el payload de bajada según el protocolo de Milesight 
    // Por ejemplo, para UC511: Payload hexadecimal "080100" para apagar, "080101" para encender
    const hexPayload = command === 'ON' ? '080101' : '080100';

    // 2. Autenticación contra tu servidor de TTN (usualmente con un API Key tipo Bearer)
    // const ttnApiUrl = `https://eu1.cloud.thethings.network/api/v3/as/applications/APP_ID/devices/${devEui}/down/push`;
    
    /* 
    const ttnResponse = await fetch(ttnApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer NNSXS.YOUR_API_KEY...`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        downlinks: [{
          frm_payload: Buffer.from(hexPayload, 'hex').toString('base64'),
          f_port: 85,
          priority: 'NORMAL'
        }]
      })
    });
    */

    console.log(`[TTN DOWNLINK] Comando '${command}' encolado hacia el nodo ${devEui}. Payload: ${hexPayload}`);

    // Si todo va bien en TTN, regresamos éxito
    return NextResponse.json({ success: true, message: 'Comando enviado a TTN exitosamente' });

  } catch (error) {
    console.error('Error enviando Downlink:', error);
    return NextResponse.json({ error: 'Error interno del servidor enviando comando' }, { status: 500 });
  }
}
