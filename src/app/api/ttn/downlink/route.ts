import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { devEui, command } = await request.json(); // command = 'ON' | 'OFF'

    if (!devEui || !command) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Milesight UC300/UC511 Payload Hexadecimal
    const hexPayload = command === 'ON' ? '080101' : '080100';

    const ttnAppId = process.env.TTN_APP_ID;
    const ttnApiKey = process.env.TTN_API_KEY;
    const ttnRegion = process.env.TTN_REGION || 'nam1'; // e.g. 'nam1' para América

    if (!ttnAppId || !ttnApiKey) {
      console.warn("Faltan las credenciales TTN_APP_ID o TTN_API_KEY en Vercel.");
      return NextResponse.json({ success: true, message: 'Simulado (Falta API Key)', hexPayload });
    }

    const ttnApiUrl = `https://${ttnRegion}.cloud.thethings.network/api/v3/as/applications/${ttnAppId}/webhooks/hidrogo-webhook/devices/${devEui}/down/push`;

    const ttnResponse = await fetch(ttnApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ttnApiKey}`,
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

    if (!ttnResponse.ok) {
      const err = await ttnResponse.text();
      console.error("[TTN ERROR]:", err);
      return NextResponse.json({ error: 'TTN rechazó el comando' }, { status: ttnResponse.status });
    }

    console.log(`[TTN DOWNLINK SUCCESS] Comando '${command}' enviado al nodo ${devEui}.`);
    return NextResponse.json({ success: true, message: 'Comando enviado a TTN exitosamente' });

  } catch (error) {
    console.error('Error enviando Downlink:', error);
    return NextResponse.json({ error: 'Error interno del servidor enviando comando' }, { status: 500 });
  }
}

