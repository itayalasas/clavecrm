
"use client";

import { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionUI } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NAV_ITEMS } from "@/lib/constants";
import type { EmailSettings, SMTPSecurity } from "@/lib/types";
import { Settings, Mail, Share2Icon, AlertTriangle, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const emailSettingsSchema = z.object({
  smtpHost: z.string().min(1, "El host SMTP es obligatorio."),
  smtpPort: z.coerce.number().int().positive("El puerto SMTP debe ser un número positivo."),
  smtpSecurity: z.enum(["None", "SSL", "TLS"], { errorMap: () => ({ message: "Selecciona un tipo de seguridad."})}),
  defaultSenderEmail: z.string().email("El correo del remitente predeterminado es inválido."),
  defaultSenderName: z.string().min(1, "El nombre del remitente es obligatorio."),
  sendRateLimit: z.coerce.number().int().min(0, "El límite de envío no puede ser negativo.").optional(),
});

type EmailSettingsFormValues = z.infer<typeof emailSettingsSchema>;

export default function SettingsPage() {
  const navItem = NAV_ITEMS.find(item => item.href === '/settings');
  const PageIcon = navItem?.icon || Settings;
  const { toast } = useToast();

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<EmailSettingsFormValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      smtpHost: "",
      smtpPort: 587,
      smtpSecurity: "TLS",
      defaultSenderEmail: "",
      defaultSenderName: "",
      sendRateLimit: 100,
    },
  });

  useEffect(() => {
    const fetchEmailSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const settingsDocRef = doc(db, "settings", "emailConfiguration");
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) {
          form.reset(docSnap.data() as EmailSettingsFormValues);
        }
      } catch (error) {
        console.error("Error al cargar configuración de correo:", error);
        toast({
          title: "Error al Cargar Configuración",
          description: "No se pudo cargar la configuración de correo electrónico.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchEmailSettings();
  }, [form, toast]);

  const onSubmitHandler: SubmitHandler<EmailSettingsFormValues> = async (data) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, "settings", "emailConfiguration");
      await setDoc(settingsDocRef, data, { merge: true });
      toast({
        title: "Configuración Guardada",
        description: "La configuración de correo electrónico ha sido actualizada.",
      });
    } catch (error) {
      console.error("Error al guardar configuración de correo:", error);
      toast({
        title: "Error al Guardar",
        description: "No se pudo guardar la configuración de correo electrónico.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
            <PageIcon className="h-7 w-7 text-primary" />
            {navItem?.label || "Configuración del Sistema"}
          </CardTitle>
          <CardDescription>
            Administra la configuración global de tu CRM, integraciones y personalizaciones.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Mail className="h-5 w-5 text-primary" />
              Configuración de Correo Electrónico
            </CardTitle>
            <CardDescription>
              Configura los ajustes de tu servidor de correo para el envío de campañas, notificaciones y correos transaccionales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSettings ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-1/2" />
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="smtpHost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Host SMTP</FormLabel>
                          <FormControl><Input placeholder="smtp.example.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="smtpPort"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Puerto SMTP</FormLabel>
                          <FormControl><Input type="number" placeholder="587" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="smtpSecurity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Seguridad SMTP</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="None">None</SelectItem>
                            <SelectItem value="SSL">SSL</SelectItem>
                            <SelectItem value="TLS">TLS</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="defaultSenderEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Remitente Predeterminado</FormLabel>
                          <FormControl><Input type="email" placeholder="noreply@example.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="defaultSenderName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre Remitente Predeterminado</FormLabel>
                          <FormControl><Input placeholder="Tu Empresa" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                   <FormField
                      control={form.control}
                      name="sendRateLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Límite de Envío (emails/hora)</FormLabel>
                          <FormControl><Input type="number" placeholder="100" {...field} /></FormControl>
                          <FormDescriptionUI>Opcional. Límite de correos que se pueden enviar por hora.</FormDescriptionUI>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  <div className="p-3 border border-amber-500 bg-amber-50 rounded-md text-amber-700 text-sm flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">Nota de Seguridad Importante:</span> Las credenciales SMTP (usuario/contraseña) no se almacenan ni se solicitan aquí por motivos de seguridad. En una aplicación de producción, estas deben gestionarse de forma segura en un backend (ej. usando Firebase Cloud Functions) y no exponerse en el cliente.
                    </div>
                  </div>
                  <CardFooter className="p-0 pt-4">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Guardar Configuración de Correo
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Share2Icon className="h-5 w-5 text-primary" />
              Integraciones de Redes Sociales
            </CardTitle>
            <CardDescription>
              Conecta tus perfiles de redes sociales para habilitar las funciones de Social CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
               <p className="text-sm text-muted-foreground">
                Aquí podrás autorizar el acceso a:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm pl-4">
                <li>Facebook (Páginas y Mensajería)</li>
                <li>Instagram (Perfiles de Empresa y Mensajería)</li>
                <li>LinkedIn (Perfiles y Páginas de Empresa)</li>
                <li>Twitter / X (Perfiles y Menciones)</li>
              </ul>
              <p className="mt-4 text-sm font-semibold text-accent-foreground">
                Integraciones en desarrollo. Próximamente podrás vincular tus cuentas.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                La disponibilidad y el alcance de las integraciones dependerán de las APIs proporcionadas por cada plataforma de red social.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
       <Card className="mt-2">
          <CardHeader>
            <CardTitle className="text-xl">Otras Configuraciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Futuras configuraciones del sistema, como campos personalizados, roles y permisos detallados, y ajustes de la interfaz, se gestionarán aquí.
            </p>
          </CardContent>
        </Card>
    </div>
  );
}

