
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionUI } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StoredLicenseInfo, LicenseDetailsApiResponse, User } from "@/lib/types";
import { Settings, KeyRound, Loader2, CheckCircle, XCircle, AlertTriangle, Info, Users, CalendarDays } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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
  const { currentUser, getAllUsers } = useAuth();
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storedLicenseInfo, setStoredLicenseInfo] = useState<StoredLicenseInfo | null>(null);
  const [currentUsersCount, setCurrentUsersCount] = useState<number | null>(null);
  const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "PROJECT_ID_NO_CONFIGURADO";

  const licenseForm = useForm<LicenseFormValues>({
    resolver: zodResolver(licenseFormSchema),
    defaultValues: {
      licenseKey: "",
    },
  });

  const fetchLicenseData = useCallback(async () => {
    setIsLoadingPage(true);
    try {
      const licenseDocRef = doc(db, "settings", "licenseConfiguration");
      const licenseDocSnap = await getDoc(licenseDocRef);
      if (licenseDocSnap.exists()) {
        const data = licenseDocSnap.data() as StoredLicenseInfo;
        setStoredLicenseInfo(data);
        licenseForm.setValue("licenseKey", data.licenseKey || "");
      } else {
        setStoredLicenseInfo(null);
        licenseForm.setValue("licenseKey", "");
      }

      const users = await getAllUsers();
      setCurrentUsersCount(users.length);

    } catch (error) {
      console.error("Error al cargar datos de licencia:", error);
      toast({ title: "Error al Cargar Datos", description: "No se pudo cargar la información de la licencia o el recuento de usuarios.", variant: "destructive" });
    } finally {
      setIsLoadingPage(false);
    }
  }, [toast, licenseForm, getAllUsers]);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchLicenseData();
    } else {
      setIsLoadingPage(false); 
    }
  }, [currentUser, fetchLicenseData]);


  const onSubmitHandler: SubmitHandler<LicenseFormValues> = async (data) => {
    if (!currentUser) {
      toast({ title: "Error", description: "Usuario no autenticado.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const requestBody = {
      licenseKey: data.licenseKey,
      appId: currentAppProjectId,
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
      let newLicenseInfo: StoredLicenseInfo = {
        licenseKey: data.licenseKey,
        lastValidatedAt: nowISO,
        status: 'Invalid',
        validationResponse: result,
        projectId: currentAppProjectId,
      };

      if (result.isValid) {
        if (result.productId !== currentAppProjectId) {
          newLicenseInfo.status = 'Invalid'; 
          toast({ title: "Clave de Licencia Inválida", description: "La clave de licencia es válida, pero para un proyecto diferente.", variant: "destructive", duration: 7000 });
        } else if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
          newLicenseInfo.status = 'Expired';
          toast({ title: "Licencia Expirada", description: "Esta licencia ha expirado.", variant: "destructive" });
        } else {
          newLicenseInfo.status = 'Valid';
          toast({ title: "Licencia Válida", description: "La licencia ha sido validada y guardada exitosamente." });
        }
      } else {
        toast({ title: "Clave de Licencia Inválida", description: "La clave proporcionada no es válida o no se pudo verificar.", variant: "destructive" });
      }

      const licenseDocRef = doc(db, "settings", "licenseConfiguration");
      await setDoc(licenseDocRef, newLicenseInfo, { merge: true });
      setStoredLicenseInfo(newLicenseInfo);
      await logSystemEvent(currentUser, 'config_change', 'LicenseSettings', 'licenseConfiguration', `Clave de licencia actualizada y validada. Estado: ${newLicenseInfo.status}.`);
      window.dispatchEvent(new Event('authChanged')); 

    } catch (error: any) {
      console.error("Error al validar licencia:", error);
      let description = error.message;
        if (error instanceof TypeError && (error.message.toLowerCase().includes('failed to fetch') || error.message.toLowerCase().includes('networkerror'))) {
        description = "No se pudo conectar al servidor de licencias. Verifica tu conexión a internet y que el servidor de licencias esté accesible. Esto podría ser un problema de CORS en el servidor de licencias o un problema de red.";
        console.error(
            "POSIBLE PROBLEMA DE CORS o RED: Revisa la consola de Red del navegador para más detalles sobre la solicitud fallida. " +
            "Asegúrate de que el servidor en " + LICENSE_VALIDATION_ENDPOINT + " está accesible y tiene configurados los encabezados CORS para permitir solicitudes desde este dominio CRM."
        );
      }
      toast({ title: "Error de Validación de Licencia", description, variant: "destructive", duration: 10000 });
      
      const errorLicenseInfo: StoredLicenseInfo = {
        licenseKey: data.licenseKey,
        lastValidatedAt: new Date().toISOString(),
        status: 'ApiError',
        validationResponse: null,
        projectId: currentAppProjectId,
      };
      const licenseDocRef = doc(db, "settings", "licenseConfiguration");
      await setDoc(licenseDocRef, errorLicenseInfo, { merge: true }).catch(dbError => console.error("Error guardando estado de error de licencia:", dbError));
      setStoredLicenseInfo(errorLicenseInfo);
      window.dispatchEvent(new Event('authChanged'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLicenseStatus = () => {
    if (isLoadingPage) {
      return (
        <Card className="mt-6">
          <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      );
    }

    const details = storedLicenseInfo?.validationResponse;
    let statusText = "Desconocido";
    let StatusIcon = AlertTriangle;
    let statusColorClass = "text-muted-foreground";
    let cardBorderClass = "border-gray-300";
    let specificMessage = "";

    if (!storedLicenseInfo || storedLicenseInfo.status === 'NotChecked' || !details) {
      return <div className="p-4 border rounded-md bg-muted/50 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2"/>
        <p className="font-semibold">No hay información de licencia o no ha sido validada.</p>
        <p className="text-xs text-muted-foreground">Ingresa una clave y valídala.</p>
      </div>;
    }
    
    const userLimitExceeded = details && currentUsersCount !== null && details.maxUsers !== null && typeof details.maxUsers === 'number' && details.maxUsers > 0 && currentUsersCount > details.maxUsers;
    const isExpired = details && details.expiresAt && new Date(details.expiresAt) < new Date();
    // Ensure storedLicenseInfo.projectId is used for comparison, as currentAppProjectId might not be directly on 'details'
    const isMismatchedProjectId = details && storedLicenseInfo.projectId && details.productId !== storedLicenseInfo.projectId;


    statusText = storedLicenseInfo.status || "No Verificada";

    if (isMismatchedProjectId) {
        StatusIcon = XCircle;
        statusText = "Clave para Otro Proyecto";
        statusColorClass = "text-red-600";
        cardBorderClass = "border-red-500";
        specificMessage = "Esta clave de licencia es válida, pero pertenece a un proyecto diferente.";
    } else if (!details.isValid) {
        StatusIcon = XCircle;
        statusText = "Inválida";
        statusColorClass = "text-red-600";
        cardBorderClass = "border-red-500";
        specificMessage = "La clave de licencia proporcionada no es válida o ha sido revocada.";
    } else if (isExpired) {
        StatusIcon = XCircle;
        statusText = "Expirada";
        statusColorClass = "text-red-600";
        cardBorderClass = "border-red-500";
        specificMessage = `La licencia expiró el ${details.expiresAt && isValid(parseISO(details.expiresAt)) ? format(parseISO(details.expiresAt), 'PP', { locale: es }) : 'N/A'}.`;
    } else if (userLimitExceeded) {
        StatusIcon = AlertTriangle;
        statusText = "Límite de Usuarios Excedido";
        statusColorClass = "text-orange-600";
        cardBorderClass = "border-orange-500";
        specificMessage = `Se ha excedido el límite de ${details.maxUsers} usuarios permitidos. Actualmente hay ${currentUsersCount || 0} usuarios.`;
    } else if (storedLicenseInfo.status === 'ApiError') {
        StatusIcon = AlertTriangle;
        statusText = "Error de API";
        statusColorClass = "text-orange-600";
        cardBorderClass = "border-orange-500";
        specificMessage = "Hubo un error al contactar el servidor de licencias la última vez. Intenta validar de nuevo.";
    } else if (storedLicenseInfo.status === 'Valid') {
        StatusIcon = CheckCircle;
        statusText = "Válida";
        statusColorClass = "text-green-600";
        cardBorderClass = "border-green-500";
    }

    return (
      <Card className={`mt-6 ${cardBorderClass}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-lg ${statusColorClass}`}>
            <StatusIcon className="h-6 w-6" />
            Estado de la Licencia: {statusText}
          </CardTitle>
          {specificMessage && <CardDescription className={statusColorClass}>{specificMessage}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><strong>Clave:</strong> <span className="font-mono text-xs bg-muted p-1 rounded">{storedLicenseInfo.licenseKey ? `${storedLicenseInfo.licenseKey.substring(0, 4)}...${storedLicenseInfo.licenseKey.substring(storedLicenseInfo.licenseKey.length - 4)}` : "N/A"}</span></div>
          {details && (
            <>
              <div><strong>Producto:</strong> {details.productName || "N/A"}</div>
              <div><strong>ID del Producto de la Licencia:</strong> {details.productId || "N/A"}</div>
              {details.maxUsers !== null && <div><strong>Máx. Usuarios:</strong> {details.maxUsers === 0 ? "Ilimitados" : details.maxUsers}</div>}
              {currentUsersCount !== null && 
                <div className={`flex items-center gap-1 ${userLimitExceeded && details.isValid && !isExpired ? 'text-orange-600 font-semibold' : ''}`}>
                    <Users className="h-4 w-4"/> Usuarios Actuales: {currentUsersCount}
                </div>
              }
              {details.expiresAt && isValid(parseISO(details.expiresAt)) && (
                <div className={`flex items-center gap-1 ${isExpired ? 'text-red-600 font-semibold' : ''}`}>
                    <CalendarDays className="h-4 w-4"/> Expira: {format(parseISO(details.expiresAt), 'PPpp', { locale: es })}
                </div>
              )}
              {details.terms && <div><strong>Términos:</strong> <span className="text-xs text-muted-foreground">{details.terms}</span></div>}
            </>
          )}
          {storedLicenseInfo.lastValidatedAt && 
           typeof storedLicenseInfo.lastValidatedAt === 'string' && 
           isValid(parseISO(storedLicenseInfo.lastValidatedAt)) && (
            <div>
              <strong>Última Validación:</strong>{' '}
              {format(parseISO(storedLicenseInfo.lastValidatedAt), 'PPpp', { locale: es })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (currentUser?.role !== 'admin') {
    return (
        <Card className="m-auto mt-10 max-w-md">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound className="h-6 w-6 text-destructive"/>Acceso Denegado</CardTitle>
                <CardDescription>No tienes permisos para gestionar la licencia de la aplicación.</CardDescription>
            </CardHeader>
        </Card>
    );
  }


  return (
    <div className="flex flex-col gap-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
            <KeyRound className="h-7 w-7 text-primary" />
            Licencia de Aplicación
          </CardTitle>
          <CardDescription>
            Gestiona la clave de licencia para tu instancia de {process.env.NEXT_PUBLIC_APP_NAME || "MiniCRM Express"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="mb-4 p-3 border rounded-md bg-muted/30">
                <p className="text-sm font-medium">ID de Proyecto Actual (appId):</p>
                <p className="text-lg font-mono text-primary bg-muted p-1.5 rounded inline-block mt-1">{currentAppProjectId}</p>
                <p className="text-xs text-muted-foreground mt-1">Este ID se utiliza para validar la licencia contra el servidor.</p>
            </div>
          <Form {...licenseForm}>
            <form onSubmit={licenseForm.handleSubmit(onSubmitHandler)} className="space-y-4">
              <FormField
                control={licenseForm.control}
                name="licenseKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clave de Licencia</FormLabel>
                    <FormControl>
                      <Input placeholder="Ingresa tu clave de licencia" {...field} disabled={isSubmitting || isLoadingPage} />
                    </FormControl>
                    <FormDescriptionUI>Pega la clave de licencia proporcionada por el administrador del sistema de licencias.</FormDescriptionUI>
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

