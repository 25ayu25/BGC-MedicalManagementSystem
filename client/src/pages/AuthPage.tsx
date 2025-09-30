// client/src/pages/AuthPage.tsx
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stethoscope, Shield, Users, Activity } from "lucide-react";

// Toggle with env var. Defaults to TRUE for now (auth disabled).
// Set VITE_DISABLE_AUTH=false later to turn real sign-in back on.
const DISABLE_AUTH =
  (import.meta.env.VITE_DISABLE_AUTH ?? "true") === "true";

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { user, loginMutation } = useAuth();
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  // When auth is disabled, immediately bypass the page.
  useEffect(() => {
    if (DISABLE_AUTH) {
      // Minimal token/user so simple guards pass
      try {
        localStorage.setItem("authToken", "demo-bypass");
        localStorage.setItem(
          "authUser",
          JSON.stringify({ id: "demo", username: "demo", role: "admin" })
        );
      } catch {}
      // Hard redirect to reset any providers/guards
      window.location.replace("/patients");
      return;
    }
    // Normal flow: if already logged in, go home
    if (user) navigate("/");
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (DISABLE_AUTH) {
      // Safety: if someone clicks the button before redirect fires
      try {
        localStorage.setItem("authToken", "demo-bypass");
        localStorage.setItem(
          "authUser",
          JSON.stringify({ id: "demo", username: loginForm.username || "demo", role: "admin" })
        );
      } catch {}
      window.location.replace("/patients");
      return;
    }

    // Real login (when re-enabled)
    loginMutation.mutate(loginForm);
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Stethoscope className="h-12 w-12 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Bahr El Ghazal Clinic
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Comprehensive Healthcare Management System
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Welcome Back</CardTitle>
              <CardDescription>
                {DISABLE_AUTH ? "Auth disabled — redirecting…" : "Sign in to access the clinic management system"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    data-testid="input-login-username"
                    type="text"
                    value={loginForm.username}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, username: e.target.value })
                    }
                    required
                    disabled={DISABLE_AUTH}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    data-testid="input-login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    required
                    disabled={DISABLE_AUTH}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  data-testid="button-login"
                  disabled={loginMutation.isPending || DISABLE_AUTH}
                >
                  {DISABLE_AUTH
                    ? "Redirecting…"
                    : loginMutation.isPending
                    ? "Signing in..."
                    : "Sign In"}
                </Button>
              </form>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
                {DISABLE_AUTH
                  ? "Demo mode is active."
                  : "Contact your administrator to create an account"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-900 dark:to-gray-900 p-12 items-center justify-center">
        <div className="max-w-lg text-white">
          <h2 className="text-4xl font-bold mb-6">
            Comprehensive Healthcare Management
          </h2>
          <p className="text-blue-100 mb-8">
            Empowering rural healthcare delivery in South Sudan with modern digital tools
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="h-6 w-6 text-blue-300 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Secure & Private</h3>
                <p className="text-sm text-blue-100">
                  Patient data protected with enterprise-grade security
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="h-6 w-6 text-blue-300 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Multi-Department Support</h3>
                <p className="text-sm text-blue-100">
                  Coordinated care across reception, laboratory, radiology, and pharmacy
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Activity className="h-6 w-6 text-blue-300 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Comprehensive Tracking</h3>
                <p className="text-sm text-blue-100">
                  Complete patient journey from registration to treatment completion
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
