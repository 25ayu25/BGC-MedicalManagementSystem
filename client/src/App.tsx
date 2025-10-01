import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import Treatment from "@/pages/Treatment";
import Laboratory from "@/pages/Laboratory";
import XRay from "@/pages/XRay";
import Ultrasound from "@/pages/Ultrasound";
import Pharmacy from "@/pages/Pharmacy";
import Reports from "@/pages/Reports";
import AllResults from "@/pages/AllResults";
import Payment from "@/pages/Payment";
import Billing from "@/pages/Billing";
import BillingSettings from "@/pages/BillingSettings";
import UserManagement from "@/pages/UserManagement";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/not-found";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import OfflineIndicator from "@/components/OfflineIndicator";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

/** Turn auth off via env. Defaults to true (auth disabled) for now. */
const DISABLE_AUTH = (import.meta.env.VITE_DISABLE_AUTH ?? "true") === "true";
/** Use normal ProtectedRoute unless auth is disabled, then use plain Route */
const GuardedRoute = DISABLE_AUTH ? Route : ProtectedRoute;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <OfflineIndicator />

          <Switch>
            {/* Auth page */}
            <Route path="/auth" component={AuthPage} />

            {/* App shell */}
            <Route>
              <Header />
              <Navigation />

              <main className="ml-64 pt-16 min-h-screen">
                <div className="px-6 py-6">
                  <Switch>
                    <GuardedRoute path="/" component={Dashboard} />
                    <GuardedRoute path="/patients" component={Patients} />
                    <GuardedRoute path="/treatment" component={Treatment} />
                    <GuardedRoute path="/laboratory" component={Laboratory} />
                    <GuardedRoute path="/xray" component={XRay} />
                    <GuardedRoute path="/ultrasound" component={Ultrasound} />
                    <GuardedRoute path="/pharmacy" component={Pharmacy} />
                    <GuardedRoute path="/payment" component={Payment} />
                    <GuardedRoute path="/billing" component={Billing} />
                    <GuardedRoute path="/billing-settings" component={BillingSettings} />
                    <GuardedRoute path="/reports" component={Reports} />
                    <GuardedRoute path="/all-results" component={AllResults} />
                    <GuardedRoute path="/users" component={UserManagement} />
                    <Route component={NotFound} />
                  </Switch>
                </div>
              </main>
            </Route>
          </Switch>

          <Toaster />
        </div>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
