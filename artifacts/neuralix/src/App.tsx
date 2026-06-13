import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import CookieBanner from "@/components/CookieBanner";
import LandingPage from "@/pages/LandingPage";
import ServersPage from "@/pages/ServersPage";
import ServerDashboard from "@/pages/ServerDashboard";
import WelcomePage from "@/pages/WelcomePage";
import GoodbyePage from "@/pages/GoodbyePage";
import VerificationPage from "@/pages/VerificationPage";
import VerifyPortal from "@/pages/VerifyPortal";
import TicketsPage from "@/pages/TicketsPage";
import AntiraidPage from "@/pages/AntiraidPage";
import LogsPage from "@/pages/LogsPage";
import PremiumPage from "@/pages/PremiumPage";
import BackupsPage from "@/pages/BackupsPage";
import SupportPage from "@/pages/SupportPage";
import AdminPage from "@/pages/AdminPage";
import NotFound from "@/pages/not-found";
import AuthCallback from "@/pages/AuthCallback";
import DocsPage from "@/pages/DocsPage";
import AutoRolesPage from "@/pages/AutoRolesPage";
import WebhooksPage from "@/pages/WebhooksPage";
import GiveawaysPage from "@/pages/GiveawaysPage";
import AiChannelsPage from "@/pages/AiChannelsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/servers" component={ServersPage} />
      <Route path="/servers/:guildId" component={ServerDashboard} />
      <Route path="/servers/:guildId/welcome" component={WelcomePage} />
      <Route path="/servers/:guildId/goodbye" component={GoodbyePage} />
      <Route path="/servers/:guildId/verification" component={VerificationPage} />
      <Route path="/servers/:guildId/tickets" component={TicketsPage} />
      <Route path="/servers/:guildId/antiraid" component={AntiraidPage} />
      <Route path="/servers/:guildId/logs" component={LogsPage} />
      <Route path="/servers/:guildId/premium" component={PremiumPage} />
      <Route path="/servers/:guildId/backups" component={BackupsPage} />
      <Route path="/servers/:guildId/auto-roles" component={AutoRolesPage} />
      <Route path="/servers/:guildId/webhooks" component={WebhooksPage} />
      <Route path="/servers/:guildId/giveaways" component={GiveawaysPage} />
      <Route path="/servers/:guildId/ai-channels" component={AiChannelsPage} />
      <Route path="/verify" component={VerifyPortal} />
      <Route path="/support" component={SupportPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/docs" component={DocsPage} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </WouterRouter>
            <CookieBanner />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
