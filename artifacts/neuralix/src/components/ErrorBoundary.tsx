import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; retryCount: number; }

const DOM_ERRORS = ["insertBefore", "removeChild", "NotFoundError", "HierarchyRequestError"];

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    const isDomError = DOM_ERRORS.some((s) => error.message.includes(s) || error.name.includes(s));
    if (isDomError && this.state.retryCount < 3) {
      setTimeout(() => {
        this.setState((s) => ({ hasError: false, error: undefined, retryCount: s.retryCount + 1 }));
      }, 200);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold mb-2">Algo salio mal</h2>
            <p className="text-muted-foreground text-sm mb-6">
              {this.state.error?.message || "Error inesperado. Recarga la pagina para continuar."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Recargar pagina</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
