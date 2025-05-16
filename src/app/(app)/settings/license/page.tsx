
"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { LicenseDetailsApiResponse, StoredLicenseInfo, User } from "@/lib/types";
import { NAV_ITEMS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionUI } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KeyRound, Loader2, AlertTriangle, CheckCircle, XCircle, Users, CalendarClock, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

const licenseFormSchema = z.object({
  licenseKey: z.string().min(10, "La clave de licencia parece demasiado corta.").max(100, "La clave de licencia parece demasiado larga."),
});

type LicenseFormValues = z.infer<typeof licenseFormSchema>;

const LICENSE_VALIDATION_ENDPOINT = "https://studio--licensekeygenius-18qwi.us-central1.hosted.app/api/validate-license";

export default function LicensePage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || []).find(item => item.href === '/settings/license');
  const PageIcon = navItem?.icon || KeyRound;
  
  const { currentUser, getAllUsers } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storedLicenseInfo, setStoredLicenseInfo] = useState<StoredLicenseInfo | null>(null);
  const [currentUsersCount, setCurrentUsersCount] = useState<number | null>(null);

  const form = useForm<LicenseFormValues>({
    resolver: zodResolver(licenseFormSchema),
    defaultValues: {
      licenseKey: "",
    },
  });

  useEffect(() => {
    const fetchLicenseInfo = async () => {
      if (!currentUser) return;
      setIsLoading(true);
      try {
        const licenseDocRef = doc(db, "settings", "licenseConfiguration");
        const docSnap = await getDoc(licenseDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as StoredLicenseInfo;
          setStoredLicenseInfo(data);
          form.setValue("licenseKey", data.licenseKey || "");
        } else {
          setStoredLicenseInfo({
            licenseKey: "",
            lastValidatedAt: "",
            status: "NotChecked",
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "unknown",
          });
        }
      } catch (error) {
        console.error("Error al cargar información de licencia:", error);
        toast({ title: "Error al Cargar Licencia", description: "No se pudo cargar la información de la licencia.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    const fetchUserCount = async () => {
        try {
            const users = await getAllUsers();
            setCurrentUsersCount(users.length);
        } catch (error) {
            console.error("Error fetching user count:", error);
        }
    };

    if (currentUser) {
      fetchLicenseInfo();
      fetchUserCount();
    }
  }, [currentUser, form, toast, getAllUsers]);

  const onSubmitHandler: SubmitHandler<LicenseFormValues> = async (data) => {
    if (!currentUser || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      toast({ title: "Error de Configuración", description: "Falta el ID del proyecto o el usuario no está autenticado.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setStoredLicenseInfo(prev => ({
        ...(prev || { licenseKey: data.licenseKey, lastValidatedAt: "", status: 'NotChecked', projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }),
        licenseKey: data.licenseKey, // Ensure the new key is used
        status: 'NotChecked', 
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID 
    } as StoredLicenseInfo));

    try {
      const response = await fetch(LICENSE_VALIDATION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: data.licenseKey,
          appId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Error desconocido del servidor de licencias." }));
        throw new Error(errorData.message || `Error del servidor de licencias: ${response.status}`);
      }

      const result = await response.json() as LicenseDetailsApiResponse;
      
      const newLicenseInfo: StoredLicenseInfo = {
        licenseKey: data.licenseKey,
        lastValidatedAt: new Date().toISOString(),
        status: 'Invalid', 
        validationResponse: result,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      };

      if (result.isValid) {
        if (result.productId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
          newLicenseInfo.status = 'Invalid'; 
          toast({ title: "Error de Licencia", description: "La clave de licencia es válida, pero para un proyecto diferente.", variant: "destructive", duration: 7000 });
        } else if (result.expiresAt && new Date(result.expiresAt) < new Date()) {
          newLicenseInfo.status = 'Expired';
          toast({ title: "Licencia Expirada", description: `La licencia expiró el ${format(parseISO(result.expiresAt), "PPpp", { locale: es })}.`, variant: "destructive", duration: 7000 });
        } else {
          newLicenseInfo.status = 'Valid';
          toast({ title: "Licencia Validada Exitosamente", description: `Estado: ${newLicenseInfo.status}. ${result.terms || ''}`, duration: 7000 });
        }
      } else {
        newLicenseInfo.status = 'Invalid';
        toast({ title: "Licencia Inválida", description: result.terms || "La clave de licencia proporcionada no es válida.", variant: "destructive", duration: 7000 });
      }
      
      const licenseDocRef = doc(db, "settings", "licenseConfiguration");
      await setDoc(licenseDocRef, {
        ...newLicenseInfo,
        lastValidatedAt: serverTimestamp(), 
      }, { merge: true });
      
      setStoredLicenseInfo(newLicenseInfo);

    } catch (error: any) {
      console.error("Error al validar licencia:", error);
      let description = error.message;
      if (error.message && (error.message.toLowerCase().includes('failed to fetch') || error.message.toLowerCase().includes('networkerror'))) {
        description = "No se pudo conectar al servidor de licencias. Verifica tu conexión a internet y que el servidor de licencias esté accesible. Esto podría ser un problema de CORS en el servidor de licencias o un problema de red.";
      }
      toast({ title: "Error de Validación de Licencia", description, variant: "destructive", duration: 10000 });
      
      const errorLicenseInfo: StoredLicenseInfo = {
        licenseKey: data.licenseKey,
        lastValidatedAt: new Date().toISOString(),
        status: 'ApiError',
        validationResponse: null,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      };
      setStoredLicenseInfo(errorLicenseInfo);
      const licenseDocRef = doc(db, "settings", "licenseConfiguration");
      await setDoc(licenseDocRef, {
        ...errorLicenseInfo,
        lastValidatedAt: serverTimestamp(),
      }, { merge: true });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        if (currentUser) {
             window.dispatchEvent(new Event('authChanged')); 
        }
      }, 1000);
    }
  };

  const renderLicenseStatus = () => {
    if (isLoading) return <p className="text-muted-foreground">Cargando estado de licencia...</p>;
    if (!storedLicenseInfo || storedLicenseInfo.status === 'NotChecked') {
      return <div className="p-4 border rounded-md bg-muted/50 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2"/>
        <p className="font-semibold">No hay información de licencia o no ha sido validada.</p>
        <p className="text-xs text-muted-foreground">Ingresa una clave y valídala.</p>
      </div>;
    }

    const { status, validationResponse: details, lastValidatedAt, licenseKey, projectId: validatedAgainstProjectId } = storedLicenseInfo;
    const currentAppProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    let displayStatus = status;
    let statusIcon = <Info className="h-5 w-5" />;
    let cardClasses = "border-blue-500 bg-blue-50";
    let textClasses = "text-blue-700";
    let specificMessage = "";

    const userLimitExceeded = currentUsersCount !== null && details?.maxUsers !== null && typeof details.maxUsers === 'number' && currentUsersCount > details.maxUsers;
    const isExpired = details?.expiresAt && new Date(details.expiresAt) < new Date();
    const isMismatchedProjectId = details?.productId && currentAppProjectId && details.productId !== currentAppProjectId;

    if (status === 'Valid') {
        if (isMismatchedProjectId) {
            displayStatus = 'Proyecto Incorrecto';
            statusIcon = <XCircle className="h-5 w-5" />;
            cardClasses = "border-red-500 bg-red-50";
            textClasses = "text-red-700";
            specificMessage = "Esta clave de licencia es válida, pero pertenece a un proyecto diferente al actual.";
        } else if (isExpired) {
            displayStatus = 'Expirada';
            statusIcon = <XCircle className="h-5 w-5" />;
            cardClasses = "border-red-500 bg-red-50";
            textClasses = "text-red-700";
        } else if (userLimitExceeded) {
            displayStatus = 'Límite Usuarios Excedido';
            statusIcon = <AlertTriangle className="h-5 w-5" />;
            cardClasses = "border-orange-500 bg-orange-50"; 
            textClasses = "text-orange-700";
        } else {
            displayStatus = 'Válida';
            statusIcon = <CheckCircle className="h-5 w-5" />;
            cardClasses = "border-green-500 bg-green-50";
            textClasses = "text-green-700";
        }
    } else if (status === 'Invalid') {
        displayStatus = 'Inválida';
        statusIcon = <XCircle className="h-5 w-5" />;
        cardClasses = "border-red-500 bg-red-50";
        textClasses = "text-red-700";
        if (details?.productId && currentAppProjectId && details.productId !== currentAppProjectId) {
            specificMessage = "Esta clave de licencia es válida, pero pertenece a un proyecto diferente al actual.";
        } else {
            specificMessage = details?.terms || "La clave de licencia no es válida.";
        }
    } else if (status === 'Expired') {
        displayStatus = 'Expirada';
        statusIcon = <XCircle className="h-5 w-5" />;
        cardClasses = "border-red-500 bg-red-50";
        textClasses = "text-red-700";
    } else if (status === 'ApiError') {
        displayStatus = 'Error de API';
        statusIcon = <AlertTriangle className="h-5 w-5" />;
        cardClasses = "border-yellow-500 bg-yellow-50";
        textClasses = "text-yellow-700";
        specificMessage = "Hubo un error al contactar el servidor de licencias. Intenta de nuevo más tarde.";
    }


    return (
      <Card className={cardClasses}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${textClasses}`}>
            {statusIcon}
            Estado de la Licencia: {displayStatus}
          </CardTitle>
          {licenseKey && <CardDescription className="text-xs">Clave: {licenseKey.substring(0,8)}...{licenseKey.substring(licenseKey.length - 8)}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {specificMessage && <p className={`font-semibold ${textClasses}`}>{specificMessage}</p>}
          {details && !isMismatchedProjectId && status !== 'Invalid' && (
            <>
              <p><strong>Producto:</strong> {details.productName} (ID Licencia: {details.productId})</p>
              {details.maxUsers !== null && typeof details.maxUsers === 'number' && (
                <p className={`flex items-center gap-1 ${userLimitExceeded ? 'text-orange-700 font-semibold' : ''}`}>
                  <Users className="h-4 w-4"/> 
                  <strong>Usuarios Permitidos:</strong> {details.maxUsers} 
                  {currentUsersCount !== null && ` (Actuales: ${currentUsersCount})`}
                  {userLimitExceeded && <Badge variant="destructive" className="ml-2 bg-orange-600 text-white">LÍMITE EXCEDIDO</Badge>}
                </p>
              )}
              {details.expiresAt && (
                <p className={`flex items-center gap-1 ${isExpired ? 'text-red-700 font-semibold' : ''}`}>
                  <CalendarClock className="h-4 w-4"/>
                  <strong>Expira:</strong> {format(parseISO(details.expiresAt), "PPpp", { locale: es })}
                  {isExpired && <Badge variant="destructive" className="ml-2">EXPIRADA</Badge>}
                </p>
              )}
              {details.terms && <p className="text-xs border-t pt-2 mt-2"><strong>Términos:</strong> {details.terms}</p>}
            </>
          )}
           {validatedAgainstProjectId && validatedAgainstProjectId !== currentAppProjectId && (
             <p className="text-xs text-red-600 mt-1">
                Esta licencia fue validada contra el ID de proyecto: <code className="bg-red-100 px-1 rounded">{validatedAgainstProjectId}</code>, pero el ID de proyecto actual es <code className="bg-red-100 px-1 rounded">{currentAppProjectId}</code>.
             </p>
            )}
          {lastValidatedAt && <p className="text-xs text-muted-foreground mt-2">Última validación: {format(typeof lastValidatedAt === 'string' ? parseISO(lastValidatedAt) : (lastValidatedAt as Timestamp).toDate(), "PPpp", {locale:es})}</p>}
        </CardContent>
      </Card>
    );
  };

  if (currentUser?.role !== 'admin') {
    return (
      <Card className="m-auto mt-10 max-w-md">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-destructive"/>Acceso Denegado</CardTitle>
            <CardDescription>No tienes permisos para gestionar la licencia de la aplicación.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <PageIcon className="h-6 w-6 text-primary" />
            {navItem?.label || "Licencia de Aplicación"}
          </CardTitle>
          <CardDescription>
            Gestiona la clave de licencia de tu aplicación CRM Rápido. Tu ID de Proyecto (appId): <code className="bg-muted px-1 py-0.5 rounded text-sm">{process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "No disponible"}</code>
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingresar Clave de Licencia</CardTitle>
          <CardDescription>
            Pega tu clave de licencia aquí y valídala para activar o actualizar el estado de tu aplicación.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitHandler)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="licenseKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="licenseKey">Clave de Licencia</FormLabel>
                    <FormControl>
                      <Input 
                        id="licenseKey" 
                        placeholder="Ej. DEMO-XYZ-123..." 
                        {...field} 
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting || isLoading}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Validando..." : "Validar y Guardar Licencia"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {renderLicenseStatus()}

    </div>
  );
}

