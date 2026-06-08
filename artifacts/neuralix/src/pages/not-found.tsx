import { useLocation } from "wouter";
import { Bot, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Bot className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-8xl font-black text-primary mb-4">404</h1>
        <h2 className="text-2xl font-bold mb-3">Pagina no encontrada</h2>
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">La pagina que buscas no existe o fue movida.</p>
        <Button onClick={() => setLocation("/")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Button>
      </div>
    </div>
  );
}
