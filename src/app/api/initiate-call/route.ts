
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { toNumber } = await request.json();

    if (!toNumber) {
      return NextResponse.json({ success: false, error: "El número de teléfono (toNumber) es requerido." }, { status: 400 });
    }

    // TODO: REEMPLAZA 'TU_PROYECTO' con tu ID de Proyecto de Firebase.
    // Asegúrate también de que la región (ej. 'us-central1') sea la correcta para tu Cloud Function.
    const fnUrl = `https://us-central1-TU_PROYECTO.cloudfunctions.net/initiateTwilioCall`;

    console.log(`API Route: Forwarding call request to ${toNumber} via Cloud Function: ${fnUrl}`);

    const cloudFunctionResponse = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Opcional: si quieres proteger tu Cloud Function con un secreto o token de autenticación
        // 'Authorization': `Bearer ${process.env.CALL_FN_SECRET}` 
      },
      body: JSON.stringify({ toNumber })
    });

    if (!cloudFunctionResponse.ok) {
      const errorText = await cloudFunctionResponse.text();
      console.error(`API Route: Error from Cloud Function (${cloudFunctionResponse.status}): ${errorText}`);
      return NextResponse.json({ success: false, error: `Error del servidor de llamadas: ${errorText}` }, { status: cloudFunctionResponse.status || 500 });
    }

    const data = await cloudFunctionResponse.json();
    console.log("API Route: Success response from Cloud Function:", data);
    return NextResponse.json({ success: true, ...data });

  } catch (error: any) {
    console.error("API Route: Error processing initiate-call request:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno del servidor en la ruta API." }, { status: 500 });
  }
}
