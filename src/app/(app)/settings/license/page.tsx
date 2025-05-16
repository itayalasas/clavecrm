
"use client";

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
import { KeyRound, Loader2, AlertTriangle, CheckCircle, XCircle, Users, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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
            // Not critical to block UI, so don't set loading false here
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
    setStoredLicenseInfo(prev => ({...prev, status: 'NotChecked'} as StoredLicenseInfo)); // Reset status visually
    
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
        status: result.isValid ? 'Valid' : 'Invalid',
        validationResponse: result,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      };

      // Check expiry
      if (result.isValid && result.expiresAt && new Date(result.expiresAt) < new Date()) {
        newLicenseInfo.status = 'Expired';
      }
      
      const licenseDocRef = doc(db, "settings", "licenseConfiguration");
      await setDoc(licenseDocRef, {
        ...newLicenseInfo,
        lastValidatedAt: serverTimestamp(), // Use server timestamp for accuracy
      }, { merge: true });
      
      setStoredLicenseInfo(newLicenseInfo); // Update local state with full details
      toast({ title: "Licencia Validada", description: `Estado: ${newLicenseInfo.status}. ${result.terms || ''}`, duration: 7000 });

    } catch (error: any) {
      console.error("Error al validar licencia:", error);
      toast({ title: "Error de Validación", description: error.message, variant: "destructive" });
      const errorLicenseInfo: StoredLicenseInfo = {
        licenseKey: data.licenseKey,
        lastValidatedAt: new Date().toISOString(),
        status: 'ApiError',
        validationResponse: null,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      };
      setStoredLicenseInfo(errorLicenseInfo);
      // Optionally save error state to Firestore
      const licenseDocRef = doc(db, "settings", "licenseConfiguration");
      await setDoc(licenseDocRef, errorLicenseInfo, { merge: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLicenseStatus = () => {
    if (isLoading) return <p className="text-muted-foreground">Cargando estado de licencia...</p>;
    if (!storedLicenseInfo || storedLicenseInfo.status === 'NotChecked' || !storedLicenseInfo.validationResponse) {
      return <div className="p-4 border rounded-md bg-muted/50 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2"/>
        <p className="font-semibold">No hay información de licencia o no ha sido validada.</p>
        <p className="text-xs text-muted-foreground">Ingresa una clave y valídala.</p>
      </div>;
    }

    const { status, validationResponse: details, lastValidatedAt, licenseKey } = storedLicenseInfo;
    const isCurrentlyValid = status === 'Valid';
    const isExpired = status === 'Expired';
    const isApiError = status === 'ApiError';
    const userLimitExceeded = currentUsersCount !== null && details?.maxUsers !== null && typeof details?.maxUsers === 'number' && currentUsersCount > details.maxUsers;


    return (
      <Card className={`${isCurrentlyValid && !userLimitExceeded ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${isCurrentlyValid && !userLimitExceeded ? 'text-green-700' : 'text-red-700'}`}>
            {isCurrentlyValid && !userLimitExceeded && <CheckCircle className="h-5 w-5" />}
            {(!isCurrentlyValid || userLimitExceeded || isExpired) && <XCircle className="h-5 w-5" />}
            {isApiError && <AlertTriangle className="h-5 w-5" />}
            Estado de la Licencia: {status}
          </CardTitle>
          {licenseKey && <CardDescription className="text-xs">Clave: {licenseKey.substring(0,8)}...{licenseKey.substring(licenseKey.length - 8)}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {details && (
            <>
              <p><strong>Producto:</strong> {details.productName} ({details.productId})</p>
              {details.maxUsers !== null && typeof details.maxUsers === 'number' && (
                <p className={`flex items-center gap-1 ${userLimitExceeded ? 'text-red-700 font-semibold' : ''}`}>
                  <Users className="h-4 w-4"/> 
                  <strong>Usuarios Permitidos:</strong> {details.maxUsers} 
                  {currentUsersCount !== null && ` (Actuales: ${currentUsersCount})`}
                  {userLimitExceeded && <Badge variant="destructive" className="ml-2">LÍMITE EXCEDIDO</Badge>}
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
          {lastValidatedAt && <p className="text-xs text-muted-foreground mt-2">Última validación: {format(typeof lastValidatedAt === 'string' ? parseISO(lastValidatedAt) : (lastValidatedAt as Timestamp).toDate(), "PPpp", {locale:es})}</p>}
           {isApiError && <p className="font-semibold text-red-700">Hubo un error al contactar el servidor de licencias. Intenta de nuevo más tarde.</p>}
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
            Gestiona la clave de licencia de tu aplicación CRM Rápido. Tu ID de Proyecto (appId): {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "No disponible"}
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
