import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Ticket, MessageSquare, Bot, AlertTriangle, ChevronLeft } from "lucide-react";
import { useGetSupportTickets, useCreateSupportTicket, useGetSupportMessages, useSendSupportMessage, getGetSupportTicketsQueryKey, getGetSupportMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function TicketBadge({ priority, status }: { priority: string; status: string }) {
  if (priority === "urgent") {
    return (
      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-red-500/20 text-red-400">
        <AlertTriangle className="w-3 h-3" />
        Reporte
      </span>
    );
  }
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", status === "open" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground")}>
      {status === "open" ? "Abierto" : "Cerrado"}
    </span>
  );
}

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "create" | "chat">("list");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [chatMsg, setChatMsg] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: tickets, isLoading } = useGetSupportTickets({ query: { queryKey: getGetSupportTicketsQueryKey(), enabled: open } });
  const createTicket = useCreateSupportTicket();
  const { data: messages } = useGetSupportMessages(selectedTicketId!, {
    query: { enabled: !!selectedTicketId, queryKey: getGetSupportMessagesQueryKey(selectedTicketId!), refetchInterval: open && view === "chat" ? 3000 : false }
  });
  const sendMessage = useSendSupportMessage();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreate = () => {
    if (!subject.trim() || !message.trim()) return;
    createTicket.mutate({ data: { subject: subject.trim(), message: message.trim() } }, {
      onSuccess: (ticket) => {
        qc.invalidateQueries({ queryKey: getGetSupportTicketsQueryKey() });
        setSubject(""); setMessage("");
        setSelectedTicketId(ticket.id);
        setView("chat");
        setTimeout(() => qc.invalidateQueries({ queryKey: getGetSupportMessagesQueryKey(ticket.id) }), 500);
      }
    });
  };

  const handleSend = async () => {
    if (!chatMsg.trim() || !selectedTicketId) return;
    setSending(true);
    sendMessage.mutate({ id: selectedTicketId, data: { content: chatMsg.trim() } }, {
      onSuccess: () => {
        setChatMsg("");
        // Refetch messages including AI auto-reply after a brief delay
        setTimeout(() => qc.invalidateQueries({ queryKey: getGetSupportMessagesQueryKey(selectedTicketId!) }), 800);
        setSending(false);
      },
      onError: () => setSending(false),
    });
  };

  const selectedTicket = tickets?.find((t) => t.id === selectedTicketId);

  return (
    <>
      <button
        data-testid="support-button"
        aria-label="Abrir centro de soporte"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Ticket className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">Soporte</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="support-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
        {open && (
          <motion.div
            key="support-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Centro de Soporte"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-16 right-4 w-84 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
            style={{ width: "22rem" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
              <div className="flex items-center gap-2">
                {view !== "list" && (
                  <button
                    onClick={() => { setView("list"); setSelectedTicketId(null); }}
                    className="text-muted-foreground hover:text-foreground mr-1 focus:outline-none"
                    aria-label="Volver a tickets"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <MessageSquare className="w-4 h-4 text-primary" aria-hidden="true" />
                <span className="font-semibold text-sm">
                  {view === "list" ? "Centro de Soporte" : view === "create" ? "Nuevo ticket" : (selectedTicket?.subject || "Chat de soporte")}
                </span>
                {selectedTicket?.priority === "urgent" && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <AlertTriangle className="w-3 h-3" /> Reporte
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar soporte"
                className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-4">
              {/* Ticket list */}
              {view === "list" && (
                <div className="space-y-3">
                  <Button size="sm" className="w-full" onClick={() => setView("create")}>
                    Abrir nuevo ticket
                  </Button>
                  {isLoading ? (
                    <div className="text-center text-muted-foreground text-sm py-4" aria-live="polite">Cargando...</div>
                  ) : !tickets?.length ? (
                    <div className="text-center text-muted-foreground text-sm py-4">No tienes tickets abiertos</div>
                  ) : (
                    <ul className="space-y-2 max-h-60 overflow-y-auto" role="list">
                      {tickets.map((t) => (
                        <li key={t.id}>
                          <button
                            onClick={() => { setSelectedTicketId(t.id); setView("chat"); }}
                            className={cn(
                              "w-full text-left p-3 rounded-lg transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                              t.priority === "urgent"
                                ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                                : "bg-secondary hover:bg-accent/10 border-border"
                            )}
                            aria-label={`Ticket: ${t.subject}, estado: ${t.status}`}
                          >
                            <div className="text-sm font-medium truncate">{t.subject}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <TicketBadge priority={t.priority || "normal"} status={t.status || "open"} />
                              <span className="text-xs text-muted-foreground">
                                {new Date(t.createdAt!).toLocaleDateString("es-ES")}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Create ticket */}
              {view === "create" && (
                <div className="space-y-3">
                  <Input
                    placeholder="Asunto del ticket"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    data-testid="input-subject"
                    aria-label="Asunto del ticket"
                    maxLength={120}
                  />
                  <Textarea
                    placeholder="Describe tu problema detalladamente..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    data-testid="textarea-message"
                    aria-label="Descripcion del problema"
                    maxLength={2000}
                  />
                  <p className="text-xs text-muted-foreground">Si tu ticket es un reporte de usuario, nuestro sistema lo detectara automaticamente y lo marcara como urgente.</p>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleCreate}
                    disabled={createTicket.isPending || !subject.trim() || !message.trim()}
                  >
                    {createTicket.isPending ? "Enviando..." : "Crear ticket"}
                  </Button>
                </div>
              )}

              {/* Chat view */}
              {view === "chat" && (
                <div className="space-y-3">
                  <div
                    className="h-52 overflow-y-auto space-y-2 pr-1"
                    role="log"
                    aria-label="Mensajes del ticket"
                    aria-live="polite"
                  >
                    {!messages?.length ? (
                      <div className="text-center text-muted-foreground text-sm py-8">Cargando mensajes...</div>
                    ) : (
                      messages.map((m) => (
                        <div key={m.id} className={`flex flex-col gap-0.5 ${m.isStaff ? "items-start" : "items-end"}`}>
                          {m.isStaff && (
                            <div className="flex items-center gap-1 ml-1">
                              {m.username === "Neuralix AI" ? (
                                <Bot className="w-3 h-3 text-primary" />
                              ) : null}
                              <span className="text-xs text-muted-foreground">{m.username}</span>
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap",
                            m.isStaff
                              ? m.username === "Neuralix AI"
                                ? "bg-primary/10 border border-primary/20 text-foreground"
                                : "bg-secondary text-foreground"
                              : "bg-primary text-primary-foreground"
                          )}>
                            {m.content}
                          </div>
                        </div>
                      ))
                    )}
                    {sending && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                        <Bot className="w-3 h-3 text-primary animate-pulse" />
                        <span>Neuralix AI esta escribiendo...</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Escribe un mensaje..."
                      value={chatMsg}
                      onChange={(e) => setChatMsg(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                      aria-label="Mensaje de soporte"
                      disabled={sending}
                      maxLength={2000}
                    />
                    <Button size="sm" onClick={handleSend} disabled={!chatMsg.trim() || sending} aria-label="Enviar mensaje">
                      <Send className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
