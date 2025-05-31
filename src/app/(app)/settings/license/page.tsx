
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionUI } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StoredLicenseInfo, LicenseDetailsApiResponse } from "@/lib/types"; // User type no es necesaria aquí si usamos authContext.currentUser
import { Settings, KeyRound, Loader2, CheckCircle, XCircle, AlertTriangle, Info, Users, CalendarDays } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore"; // serverTimestamp no se usa aquí directamente
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { format, parseISO, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { logSystemEvent } from "@/lib/auditLogger";

const LICENSE_VALIDATION_ENDPOINT = "https://studio--licensekeygenius-18qwi.us-central1.hosted.app/api/validate-license";

const licenseFormSchema = z.object({
  licenseKey: z.string().min(1, "La clave de licencia es obligatoria."),
});

type LicenseFormValues = z.infer<typeof licenseFormSchema>;

export default function LicensePage() {
  const { toast } = useToast();
  // currentUser, userCount y effectiveLicenseStatus ahora vienen del AuthContext
  const { currentUser, userCount: currentUsersCountFromAuth, effectiveLicenseStatus } = useAuth(); 
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storedLicenseInfo, setStoredLicenseInfo] = useState<StoredLicenseInfo | null>(null);
  // currentUsersCount se obtiene ahora de currentUsersCountFromAuth
  const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";

  const licenseForm = useForm<LicenseFormValues>({
    resolver: zodResolver(licenseFormSchema),
    defaultValues: {
      licenseKey: "",
    },
  });

  const fetchLicenseData = useCallback(async () => {
    if (!currentUser || !currentUser.tenantId) {
      // Si no hay currentUser o tenantId, no se puede cargar la licencia específica del tenant.
      // Esto podría pasar si el admin accede antes de que AuthContext esté completamente listo,
      // o si hay un problema con la cuenta del admin.
      console.warn("LicensePage: currentUser o currentUser.tenantId no disponible para fetchLicenseData.");
      setIsLoadingPage(false);
      // El renderizado de la página mostrará un mensaje si el rol no es admin.
      // Si es admin pero falta tenantId, es un estado de error que debe ser investigado.
      if (currentUser && currentUser.role === 'admin' && !currentUser.tenantId) {
          toast({title: "Error de Configuración", description: "La cuenta de administrador no tiene un tenant asignado.", variant: "destructive"});
      }
      return;
    }

    setIsLoadingPage(true);
    try {
      // Leer la licencia desde la subcolección del tenant
      const licenseDocRef = doc(db, "tenants", currentUser.tenantId, "license", "info");
      const licenseDocSnap = await getDoc(licenseDocRef);

      if (licenseDocSnap.exists()) {
        const data = licenseDocSnap.data() as StoredLicenseInfo;
        setStoredLicenseInfo(data);
        licenseForm.setValue("licenseKey", data.licenseKey || "");
        console.log("LicensePage: Datos de licencia cargados para tenant", currentUser.tenantId, data);
      } else {
        setStoredLicenseInfo(null);
        licenseForm.setValue("licenseKey", "");
        console.log("LicensePage: No se encontró documento de licencia para tenant", currentUser.tenantId);
      }
      // currentUsersCount ya está disponible desde currentUsersCountFromAuth, no es necesario volver a cargarlo aquí.

    } catch (error) {
      console.error("Error al cargar datos de licencia del tenant:", error);
      toast({ title: "Error al Cargar Datos de Licencia", description: "No se pudo cargar la información de la licencia para tu tenant.", variant: "destructive" });
    } finally {
      setIsLoadingPage(false);
    }
  }, [currentUser, toast, licenseForm]);

  useEffect(() => {
    // Solo admin puede acceder y cargar datos.
    // fetchLicenseData ya verifica currentUser y currentUser.tenantId.
    if (currentUser?.role === 'admin') {
      fetchLicenseData();
    } else {
      setIsLoadingPage(false); 
    }
  }, [currentUser, fetchLicenseData]);


  const onSubmitHandler: SubmitHandler<LicenseFormValues> = async (data) => {
    if (!currentUser || !currentUser.tenantId) {
      toast({ title: "Error", description: "Usuario no autenticado o sin tenant asignado.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const requestBody = {
      licenseKey: data.licenseKey,
      appId: currentAppProjectId, // Este debería ser el ID de producto/aplicación que tu servidor de licencias espera
    };

    console.log("Enviando solicitud de validación a:", LICENSE_VALIDATION_ENDPOINT);
    console.log("Cuerpo de la solicitud:", JSON.stringify(requestBody, null, 2));

    try {
      const response = await fetch(LICENSE_VALIDATION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Error del servidor de licencias (${response.status}): ${errorData.message || response.statusText}`);
      }

      const result: LicenseDetailsApiResponse = await response.json();
      const nowISO = new Date().toISOString();
      
      // Construir StoredLicenseInfo basado en la respuesta de validación
      // y la estructura que definimos en auth-context.tsx
      let newLicenseInfo: StoredLicenseInfo = {
        licenseKey: data.licenseKey,
        lastValidatedAt: nowISO,
        status: 'not_configured', // Default status
        // Guardar la respuesta completa de validación podría ser útil, pero adaptamos a StoredLicenseInfo
        // validationResponse: result, // Si aún quieres guardar la respuesta completa
        expiryDate: result.expiresAt || undefined,
        maxUsersAllowed: typeof result.maxUsers === 'number' ? result.maxUsers : undefined,
        type: result.productName || undefined, // O un campo específico de tipo de licencia de tu API
        // projectId: currentAppProjectId, // El ID del proyecto de la app, no necesariamente de la licencia
      };

      if (result.isValid) {
        if (result.productId !== currentAppProjectId) {
          newLicenseInfo.status = 'active'; // Licencia es válida, pero para otro producto. Marcamos como 'active' pero el UI lo indicará.
          toast({ title: "Clave de Licencia para Otro Producto", description: "La clave es válida, pero para un producto/proyecto diferente. Verifica la clave.", variant: "warning", duration: 7000 });
        } else if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
          newLicenseInfo.status = 'expired';
          toast({ title: "Licencia Expirada", description: "Esta licencia ha expirado.", variant: "destructive" });
        } else {
          newLicenseInfo.status = 'active'; // Estado principal de la licencia
          toast({ title: "Licencia Válida", description: "La licencia ha sido validada y guardada exitosamente." });
        }
      } else {
        newLicenseInfo.status = 'cancelled'; // O 'invalid' si manejas ese estado
        toast({ title: "Clave de Licencia Inválida", description: result.reason || "La clave proporcionada no es válida o no se pudo verificar.", variant: "destructive" });
      }

      // Guardar la licencia en la subcolección del tenant
      const licenseDocRef = doc(db, "tenants", currentUser.tenantId, "license", "info");
      await setDoc(licenseDocRef, newLicenseInfo, { merge: true });
      setStoredLicenseInfo(newLicenseInfo);
      await logSystemEvent(currentUser, 'config_change', 'LicenseSettings', `tenants/${currentUser.tenantId}/license/info`, `Clave de licencia actualizada. Nuevo estado: ${newLicenseInfo.status}.`);
      
      // Disparar un evento para que AuthContext pueda recargar la licencia si es necesario
      // O mejor, que AuthContext actualice su `licenseInfo` si se pasa `setLicenseInfo` del contexto aquí.
      // Por ahora, un evento simple.
      window.dispatchEvent(new Event('licenseChanged')); 

    } catch (error: any) {
      console.error("Error al validar licencia:", error);
      let description = error.message;
      if (error instanceof TypeError && (error.message.toLowerCase().includes('failed to fetch') || error.message.toLowerCase().includes('networkerror'))) {
        description = "No se pudo conectar al servidor de licencias. Verifica tu conexión y que el servidor de licencias sea accesible (podría ser CORS).";
      }
      toast({ title: "Error de Validación de Licencia", description, variant: "destructive", duration: 10000 });
      
      const errorLicenseInfo: StoredLicenseInfo = {
        licenseKey: data.licenseKey,
        lastValidatedAt: new Date().toISOString(),
        status: 'not_configured', // O un estado de error específico
        expiryDate: undefined,
        maxUsersAllowed: undefined,
      };
      const licenseDocRef = doc(db, "tenants", currentUser.tenantId, "license", "info");
      await setDoc(licenseDocRef, errorLicenseInfo, { merge: true }).catch(dbError => console.error("Error guardando estado de error de licencia:", dbError));
      setStoredLicenseInfo(errorLicenseInfo);
      window.dispatchEvent(new Event('licenseChanged'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLicenseStatus = () => {
    if (isLoadingPage && !storedLicenseInfo) { // Muestra Skeleton solo si realmente está cargando y no hay datos aún
      return (
        <Card className="mt-6"><CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
          <CardContent className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></CardContent>
        </Card>
      );
    }

    const currentLicenseToDisplay = storedLicenseInfo; // Usar la licencia cargada específica del tenant
    const usersForTenant = currentUsersCountFromAuth; // Usar el conteo de usuarios del AuthContext

    let statusText = "Desconocido";
    let StatusIcon = AlertTriangle;
    let statusColorClass = "text-muted-foreground";
    let cardBorderClass = "border-gray-300";
    let specificMessage = "";

    if (!currentLicenseToDisplay || currentLicenseToDisplay.status === 'not_configured' || !currentLicenseToDisplay.status) {
      return <div className="p-4 border rounded-md bg-muted/50 text-center mt-6">
        <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2"/>
        <p className="font-semibold">No hay información de licencia o no está configurada para este tenant.</p>
        <p className="text-xs text-muted-foreground">Ingresa una clave de licencia y valídala.</p>
      </div>;
    }
    
    // Validaciones basadas en la información de StoredLicenseInfo
    const isExpired = currentLicenseToDisplay.expiryDate && 
                      ( (currentLicenseToDisplay.expiryDate instanceof Timestamp ? currentLicenseToDisplay.expiryDate.toDate() : new Date(currentLicenseToDisplay.expiryDate as string)) < new Date() );
    
    const userLimitExceeded = typeof currentLicenseToDisplay.maxUsersAllowed === 'number' && 
                              usersForTenant !== null && 
                              currentLicenseToDisplay.maxUsersAllowed > 0 && 
                              usersForTenant > currentLicenseToDisplay.maxUsersAllowed;

    statusText = currentLicenseToDisplay.status || "No Verificada";

    // Lógica para determinar el mensaje y estilo basado en el estado EFECTIVO (calculado aquí o desde AuthContext)
    // Aquí podríamos usar `effectiveLicenseStatus` de AuthContext si preferimos una fuente única de verdad para el estado.
    // Por ahora, recalculamos para la UI basado en `currentLicenseToDisplay`.

    if (currentLicenseToDisplay.status === 'cancelled') {
        StatusIcon = XCircle; statusText = "Cancelada"; statusColorClass = "text-red-600"; cardBorderClass = "border-red-500";
        specificMessage = "La licencia ha sido cancelada.";
    } else if (isExpired || currentLicenseToDisplay.status === 'expired') {
        StatusIcon = XCircle; statusText = "Expirada"; statusColorClass = "text-red-600"; cardBorderClass = "border-red-500";
        specificMessage = `La licencia expiró el ${currentLicenseToDisplay.expiryDate ? format( (currentLicenseToDisplay.expiryDate instanceof Timestamp ? currentLicenseToDisplay.expiryDate.toDate() : new Date(currentLicenseToDisplay.expiryDate as string)), 'PP', { locale: es }) : 'N/A'}.`;
    } else if (userLimitExceeded) {
        StatusIcon = AlertTriangle; statusText = "Límite de Usuarios Excedido"; statusColorClass = "text-orange-600"; cardBorderClass = "border-orange-500";
        specificMessage = `Se ha excedido el límite de ${currentLicenseToDisplay.maxUsersAllowed} usuarios. Actualmente hay ${usersForTenant || 0}.`;
    } else if (currentLicenseToDisplay.status === 'active' || currentLicenseToDisplay.status === 'trial') {
        StatusIcon = CheckCircle; statusText = currentLicenseToDisplay.status === 'trial' ? "Prueba Activa" : "Válida"; statusColorClass = "text-green-600"; cardBorderClass = "border-green-500";
    } else {
        // Otros estados como 'no_license' si se guardó así, o un fallback
        StatusIcon = AlertTriangle; statusText = "Atención Requerida"; statusColorClass = "text-yellow-600"; cardBorderClass = "border-yellow-500";
        specificMessage = `El estado de la licencia es '${currentLicenseToDisplay.status}'. Por favor, verifica o valida la clave.`;
    }

    return (
      <Card className={`mt-6 ${cardBorderClass}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-lg ${statusColorClass}`}> <StatusIcon className="h-6 w-6" /> Estado de la Licencia: {statusText} </CardTitle>
          {specificMessage && <CardDescription className={`${statusColorClass} mt-1`}>{specificMessage}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><strong>Clave:</strong> <span className="font-mono text-xs bg-muted p-1 rounded">{currentLicenseToDisplay.licenseKey ? `${currentLicenseToDisplay.licenseKey.substring(0, 4)}...${currentLicenseToDisplay.licenseKey.substring(currentLicenseToDisplay.licenseKey.length - 4)}` : "N/A"}</span></div>
          {currentLicenseToDisplay.type && <div><strong>Tipo:</strong> {currentLicenseToDisplay.type}</div>}
          {typeof currentLicenseToDisplay.maxUsersAllowed === 'number' && <div><strong>Máx. Usuarios Permitidos:</strong> {currentLicenseToDisplay.maxUsersAllowed === 0 ? "Ilimitados" : currentLicenseToDisplay.maxUsersAllowed}</div>}
          {usersForTenant !== null && 
            <div className={`flex items-center gap-1 ${userLimitExceeded ? 'text-orange-600 font-semibold' : ''}`}> <Users className="h-4 w-4"/> Usuarios Actuales en este Tenant: {usersForTenant} </div>
          }
          {currentLicenseToDisplay.expiryDate && isValid( (currentLicenseToDisplay.expiryDate instanceof Timestamp ? currentLicenseToDisplay.expiryDate.toDate() : new Date(currentLicenseToDisplay.expiryDate as string)) ) && (
            <div className={`flex items-center gap-1 ${isExpired ? 'text-red-600 font-semibold' : ''}`}> <CalendarDays className="h-4 w-4"/> Expira: {format( (currentLicenseToDisplay.expiryDate instanceof Timestamp ? currentLicenseToDisplay.expiryDate.toDate() : new Date(currentLicenseToDisplay.expiryDate as string)), 'PPpp', { locale: es })} </div>
          )}
          {currentLicenseToDisplay.lastValidatedAt && isValid(parseISO(currentLicenseToDisplay.lastValidatedAt as string)) && (
            <div><strong>Última Validación (API):</strong> {format(parseISO(currentLicenseToDisplay.lastValidatedAt as string), 'PPpp', { locale: es })}</div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Restricción de acceso a la página si no es admin
  if (!currentUser || currentUser.role !== 'admin') {
    return (
        <Card className="m-auto mt-10 max-w-md">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound className="h-6 w-6 text-destructive"/>Acceso Denegado</CardTitle>
                <CardDescription>No tienes permisos para gestionar la licencia de la aplicación.</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  // Si es admin pero aún está cargando información esencial del AuthContext (como currentUser o tenantId)
  if (isLoadingPage && (!currentUser || !currentUser.tenantId)) {
      return (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-8 p-4 md:p-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-semibold"> <KeyRound className="h-7 w-7 text-primary" /> Licencia del Tenant </CardTitle>
          <CardDescription> Gestiona la clave de licencia para el tenant actual: <strong>{currentUser?.tenantId || "Desconocido"}</strong>. </CardDescription>
        </CardHeader>
        <CardContent>
            {/* ... (resto del formulario y visualización del estado de licencia sin cambios significativos en la estructura) ... */}
            <div className="mb-4 p-3 border rounded-md bg-muted/30">
                <p className="text-sm font-medium">ID de Proyecto de Aplicación (appId para validación externa):</p>
                <p className="text-lg font-mono text-primary bg-muted p-1.5 rounded inline-block mt-1">{currentAppProjectId}</p>
            </div>
          <Form {...licenseForm}>
            <form onSubmit={licenseForm.handleSubmit(onSubmitHandler)} className="space-y-4">
              <FormField control={licenseForm.control} name="licenseKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clave de Licencia</FormLabel>
                    <FormControl><Input placeholder="Ingresa tu clave de licencia" {...field} disabled={isSubmitting || isLoadingPage} /></FormControl>
                    <FormDescriptionUI>Pega la clave de licencia asociada a este tenant.</FormDescriptionUI>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isSubmitting || isLoadingPage}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Validando..." : "Validar y Guardar Licencia"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      {renderLicenseStatus()}
    </div>
  );
}
