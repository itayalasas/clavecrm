
"use client";

import { useState, useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as FormDescriptionUI } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NAV_ITEMS } from "@/lib/constants";
import type { EmailSettings, SMTPSecurity } from "@/lib/types";
import { Settings, Mail, Share2Icon, AlertTriangle, Loader2, Eye, EyeOff, ShieldCheck, History, MessageCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, addDoc, collection, type Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context"; 
import Link from "next/link"; 

const emailSettingsSchema = z.object({
  smtpHost: z.string().min(1, "El host SMTP es obligatorio."),
  smtpPort: z.coerce.number().int().positive("El puerto SMTP debe ser un número positivo."),
  smtpUser: z.string().min(1, "El usuario SMTP es obligatorio."),
  smtpPass: z.string().min(1, "La contraseña SMTP es obligatoria."),
  smtpSecurity: z.enum(["None", "SSL", "TLS"], { errorMap: () => ({ message: "Selecciona un tipo de seguridad."})}),
  defaultSenderEmail: z.string().email("El correo del remitente predeterminado es inválido."),
  defaultSenderName: z.string().min(1, "El nombre del remitente es obligatorio."),
  sendRateLimit: z.coerce.number().int().min(0, "El límite de envío no puede ser negativo.").optional(),
});

type EmailSettingsFormValues = z.infer<typeof emailSettingsSchema>;

export default function SettingsPage() {
  const navItem = NAV_ITEMS.flatMap(item => item.subItems || item).find(item => item.label === 'Configuración General');
  const PageIcon = navItem?.icon || Settings;
  const { toast } = useToast();
  const { currentUser } = useAuth(); 

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  const form = useForm<EmailSettingsFormValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpPass: "",
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

  const logSystemEvent = async (action: string, entityType: string, entityId: string, details: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, "activityLogs"), {
        category: 'system_audit' as const,
        type: 'config_change' as const, 
        subject: action,
        details: `${details} por ${currentUser.name}.`,
        timestamp: serverTimestamp(), 
        loggedByUserId: currentUser.id,
        loggedByUserName: currentUser.name,
        entityType: entityType,
        entityId: entityId,
        createdAt: serverTimestamp(), 
      });
    } catch (error) {
      console.error("Error logging system event:", error);
    }
  };

  const onSubmitHandler: SubmitHandler<EmailSettingsFormValues> = async (data) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, "settings", "emailConfiguration");
      await setDoc(settingsDocRef, data, { merge: true });
      toast({
        title: "Configuración Guardada",
        description: "La configuración de correo electrónico ha sido actualizada.",
      });
      await logSystemEvent("Actualización Config. Email", "EmailSettings", "emailConfiguration", "Se actualizaron los ajustes de correo electrónico.");
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="smtpUser"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Usuario SMTP</FormLabel>
                            <FormControl><Input placeholder="usuario@example.com" {...field} /></FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    <FormField
                        control={form.control}
                        name="smtpPass"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Contraseña SMTP</FormLabel>
                            <div className="relative">
                                <FormControl><Input type={showSmtpPass ? "text" : "password"} placeholder="••••••••" {...field} /></FormControl>
                                <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowSmtpPass(!showSmtpPass)}
                                >
                                {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
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
                      <span className="font-semibold">Nota de Seguridad Importante:</span> Las credenciales SMTP (usuario/contraseña) se almacenarán en Firestore. Asegúrate de que tus reglas de seguridad de Firestore protejan adecuadamente el documento `settings/emailConfiguration` para restringir el acceso no autorizado a estas credenciales.
                      Idealmente, en producción avanzada, estas credenciales se manejarían a través de secretos en el entorno de Cloud Functions, no directamente en Firestore si el acceso al documento no puede ser estrictamente limitado.
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
              <ShieldCheck className="h-5 w-5 text-primary" />
              Seguridad y Auditoría
            </CardTitle>
            <CardDescription>
              Configuraciones de seguridad y acceso al historial de auditoría del sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold">Autenticación Multifactor (MFA)</h4>
              <p className="text-sm text-muted-foreground">
                La MFA se gestiona directamente en la consola de Firebase para cada cuenta de usuario.
                <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline ml-1">
                  Ir a Firebase Console
                </a>
              </p>
               <p className="text-xs text-muted-foreground mt-1">
                Se recomienda habilitar MFA para todos los usuarios, especialmente administradores.
              </p>
            </div>
            <div>
              <h4 className="font-semibold">Roles y Permisos</h4>
              <p className="text-sm text-muted-foreground">
                La asignación de roles a los usuarios se realiza en la sección de <Link href="/user-management" className="text-primary underline">Gestión de Usuarios</Link>.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Permisos más granulares por módulo o acción podrían implementarse en futuras versiones.
              </p>
            </div>
             <div>
              <h4 className="font-semibold">Historial de Auditoría</h4>
              <p className="text-sm text-muted-foreground">
                Consulta el registro de acciones importantes realizadas en el sistema.
              </p>
              <Button variant="outline" size="sm" asChild className="mt-2">
                <Link href="/audit-log">
                  <History className="mr-2 h-4 w-4" /> Ver Historial de Auditoría
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MessageCircle className="h-5 w-5 text-primary" />
            Configuración del Widget de Chat en Vivo
          </CardTitle>
          <CardDescription>
            Personaliza la apariencia y el comportamiento del widget de chat en vivo para tu sitio web.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Define cómo se verá y funcionará el chat en tu página. El widget real y su funcionalidad de chat en tiempo real están en desarrollo.
          </p>
          <Button asChild>
            <Link href="/settings/live-chat-widget">
              Ir a Configuración del Chat en Vivo
            </Link>
          </Button>
        </CardContent>
      </Card>


       <Card className="mt-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Share2Icon className="h-5 w-5 text-primary" />
              Integraciones
            </CardTitle>
            <CardDescription>
              Conecta tu CRM con otras herramientas y plataformas.
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
                La disponibilidad y el alcance de las integraciones dependerán de las APIs proporcionadas por cada plataforma.
              </p>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
