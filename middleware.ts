
import { NextResponse, type NextRequest } from 'next/server';

const KNOWN_TENANTS = ['tenant1', 'tenant2', 'clavecrm']; // Ejemplo, podría venir de una DB o config
const BASE_HOST = process.env.NEXT_PUBLIC_BASE_URL || 'localhost:9000'; // Asegúrate de tener esta variable de entorno

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || BASE_HOST;

  // Ignorar rutas de assets, API, etc.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/static/') ||
    url.pathname.includes('.') // Asume archivos con extensiones (ej. favicon.ico, .png)
  ) {
    return NextResponse.next();
  }

  const parts = hostname.replace(`.${BASE_HOST}`, '').split('.');
  let tenantId: string | null = null;

  if (hostname === BASE_HOST || parts[0] === 'www') {
    // Acceso al dominio base sin subdominio específico (o con www)
    // Puedes redirigir a una página de selección de tenant, o permitir acceso a ciertas páginas (ej. login)
    // Por ahora, simplemente no añadiremos el header x-tenant-id
    console.log(`Middleware: Acceso al dominio base: ${hostname}`);
  } else if (parts.length > 0 && parts[0] !== BASE_HOST.split(':')[0]) {
    // Asumimos que el primer "part" es el subdominio/tenantId
    // En una app real, validarías si este subdominio es un tenant válido
    tenantId = parts[0];
    if (!KNOWN_TENANTS.includes(tenantId) && tenantId !== process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN) {
        // Subdominio no reconocido. Podrías redirigir a una página de error o al dominio base.
        // console.warn(`Middleware: Subdominio desconocido '${tenantId}'. Redirigiendo al dominio base.`);
        // const rootUrl = new URL(request.nextUrl.protocol + BASE_HOST);
        // return NextResponse.redirect(rootUrl);
        // Por ahora, permitimos el acceso pero no establecemos tenantId, la app deberá manejarlo
        console.warn(`Middleware: Subdominio desconocido '${tenantId}'. No se establecerá x-tenant-id.`);
        tenantId = null; // Tratar como si no hubiera tenant
    } else {
        console.log(`Middleware: Tenant identificado: ${tenantId}`);
    }
  } else {
    console.log(`Middleware: No se pudo identificar un tenant específico para el hostname: ${hostname}`);
  }

  const requestHeaders = new Headers(request.headers);
  if (tenantId) {
    requestHeaders.set('x-tenant-id', tenantId);
  } else {
    requestHeaders.delete('x-tenant-id'); // Asegurarse de que no esté si no hay tenant
  }

  // Si es el dominio base y no es una ruta pública permitida, considerar redirección a login
  // if (!tenantId && !['/login', '/signup', '/access-denied'].includes(url.pathname)) {
  //   // Podrías querer redirigir a login o a una página "selecciona tu espacio"
  //   // Por ahora, lo dejamos pasar y la lógica de la página decidirá
  // }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - files in public folder directly (e.g., .png, .svg)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
