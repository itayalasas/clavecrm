
import { NextResponse, type NextRequest } from 'next/server';

// Actualiza esta lista con tus tenants conocidos o cárgala dinámicamente.
const KNOWN_TENANTS = ['tenant1', 'tenant2', 'clavecrm', 'democrm']; // Tenant 'democrm' añadido
const BASE_HOST = process.env.NEXT_PUBLIC_BASE_URL || 'localhost:9000'; // Asegúrate de tener esta variable de entorno

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  let hostname = request.headers.get('host') || BASE_HOST;

  // Eliminar el puerto si está presente y BASE_HOST no lo tiene (típico para producción)
  // Para Cloud Workstations, el puerto es parte del hostname, así que esta lógica es más para localhost o producción estándar.
  if (hostname.includes(':') && !BASE_HOST.includes(':')) {
    hostname = hostname.split(':')[0];
  }
  
  console.log(`Middleware: Hostname original: ${request.headers.get('host')}`);
  console.log(`Middleware: Hostname procesado: ${hostname}`);
  console.log(`Middleware: BASE_HOST: ${BASE_HOST}`);

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
  
  console.log(`Middleware: Parts después de reemplazar BASE_HOST y split: ${parts}`);

  if (hostname === BASE_HOST || parts[0] === 'www' || hostname.endsWith(process.env.NEXT_PUBLIC_VERCEL_URL || 'nevermatchthis.com')) {
    // Acceso al dominio base sin subdominio específico (o con www), o si es el dominio de preview de Vercel sin subdominio de tenant.
    console.log(`Middleware: Acceso al dominio base o preview de Vercel: ${hostname}`);
  } else if (parts.length > 0 && parts[0] !== BASE_HOST.split('.')[0] && parts[0] !== '') {
    // Asumimos que el primer "part" es el subdominio/tenantId
    tenantId = parts[0];
    if (!KNOWN_TENANTS.includes(tenantId) && tenantId !== process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN) {
        console.warn(`Middleware: Subdominio desconocido '${tenantId}'. Se tratará como si no hubiera tenant específico.`);
        tenantId = null; // Tratar como si no hubiera tenant
    } else {
        console.log(`Middleware: Tenant identificado: ${tenantId}`);
    }
  } else {
    console.log(`Middleware: No se pudo identificar un tenant específico para el hostname: ${hostname}. Parts: ${parts}`);
  }

  const requestHeaders = new Headers(request.headers);
  if (tenantId) {
    requestHeaders.set('x-tenant-id', tenantId);
    console.log(`Middleware: Estableciendo header x-tenant-id: ${tenantId}`);
  } else {
    requestHeaders.delete('x-tenant-id'); 
    console.log(`Middleware: No se estableció x-tenant-id.`);
  }

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
