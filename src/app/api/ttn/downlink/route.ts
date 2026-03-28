import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Verificar token de API para proteger el endpoint
    const downlinkSecret = process.env.DOWNLINK_API_SECRET;
    if (downlinkSecret) {
      const authHeader = request.headers.get('X-API-Key');
      if (authHeader !== downlinkSecret) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }
    }

    const { devEui, command } = await request.json(); // command = 'ON' | 'OFF'

    if (!devEui || !command) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Milesight UC300/UC511 Payload Hexadecimal
    const hexPayload = command === 'ON' ? '080101' : '080100';

    const ttnAppId = process.env.TTN_APP_ID;
    const ttnApiKey = process.env.TTN_API_KEY;
    const ttnRegion = process.env.TTN_REGION || 'nam1';

    if (!ttnAppId || !ttnApiKey) {
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
      return NextResponse.json({ error: 'TTN rechazó el comando', detail: err }, { status: ttnResponse.status });
    }

    return NextResponse.json({ success: true, message: 'Comando enviado a TTN exitosamente' });

  } catch (error) {
    return NextResponse.json({ error: 'Error interno del servidor enviando comando' }, { status: 500 });
  }
}
