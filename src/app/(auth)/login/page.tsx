
"use client";

import { useState } from "react";
import Image from "next/image"; // Import Image from next/image
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME } from "@/lib/constants"; // APP_ICON is removed

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const logoSrc = "/clave-crm-logo.png"; // Path to your logo

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast({ title: "Inicio de Sesión Exitoso", description: "Redirigiendo a tu panel..." });
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Error de inicio de sesión:", error);
      toast({
        title: "Error de Inicio de Sesión",
        description: error.message || "Ocurrió un error. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12">
      <div className="mx-auto grid w-[350px] gap-6">
         <div className="flex flex-col items-center gap-2 text-center">
            <Image src={logoSrc} alt={`${APP_NAME} Logo`} width={64} height={64} className="h-16 w-16" data-ai-hint="logo key"/> {/* Increased size */}
            <h1 className="text-3xl font-bold" style={{ color: 'hsl(var(--primary))' }}>{APP_NAME}</h1>
            <p className="text-balance text-muted-foreground">
              Accede a tu cuenta
            </p>
          </div>

        <Card>
          <form onSubmit={handleLogin}>
            <CardHeader>
              <CardTitle>Iniciar Sesión</CardTitle>
              <CardDescription>Ingresa tu correo y contraseña para acceder.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Correo Electrónico</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="tu@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Contraseña</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Iniciando Sesión..." : "Iniciar Sesión"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
