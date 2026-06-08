import { useState, useEffect } from "react";
import { MessageSquare, Send, Plus, ChevronRight, Clock } from "lucide-react";
import { useGetSupportTickets, useCreateSupportTicket, useGetSupportMessages, useSendSupportMessage, getGetSupportTicketsQueryKey, getGetSupportMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function SupportPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "create" | "chat">("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [chatMsg, setChatMsg] = useState("");

  useEffect(() => { setView("list"); setSelectedId(null); }, []);

  const { data: tickets, isLoading } = useGetSupportTickets({ query: { queryKey: getGetSupportTicketsQueryKey() } });
  const createTicket = useCreateSupportTicket();
  const { data: messages } = useGetSupportMessages(selectedId!, { query: { enabled: !!selectedId, queryKey: getGetSupportMessagesQueryKey(selectedId!) } });
  const sendMessage = useSendSupportMessage();

  const handleCreate = () => {
    if (!subject || !message) { toast({ title: "Completa todos los campos", variant: "destructive" }); return; }
    createTicket.mutate({ data: { subject, message } }, {
      onSuccess: () => { toast({ title: "Ticket creado" }); qc.invalidateQueries({ queryKey: getGetSupportTicketsQueryKey() }); setSubject(""); setMessage(""); setView("list"); }
    });
  };

  const handleSend = () => {
    if (!chatMsg || !selectedId) return;
    sendMessage.mutate({ id: selectedId, data: { content: chatMsg } }, {
      onSuccess: () => { setChatMsg(""); qc.invalidateQueries(); }
    });
  };

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-black mb-1">Centro de Soporte</h1>
        <p className="text-muted-foreground text-sm">Crea tickets de soporte y consulta el historial de conversaciones.</p>
      </div>

      {view === "list" && (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setView("create")} className="gap-2" data-testid="btn-new-ticket">
              <Plus className="w-4 h-4" /> Nuevo ticket
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : !Array.isArray(tickets) || !tickets.length ? (
            <div className="text-center py-24 bg-card rounded-xl border border-card-border">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Sin tickets</h3>
              <p className="text-muted-foreground text-sm">Crea un ticket para contactar con el equipo de soporte.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <button key={ticket.id} data-testid={`ticket-${ticket.id}`}
                  onClick={() => { setSelectedId(ticket.id); setView("chat"); }}
                  className="w-full flex items-center justify-between p-5 bg-card border border-card-border rounded-xl hover:border-primary/30 transition-all text-left">
                  <div className="flex items-center gap-4">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ticket.status === "open" ? "bg-green-400" : "bg-muted-foreground"}`} />
                    <div>
                      <p className="font-semibold text-sm">{ticket.subject}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${ticket.status === "open" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>{ticket.status}</span>
                        <span className="text-xs text-muted-foreground">{ticket.priority}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(ticket.createdAt).toLocaleDateString("es")}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "create" && (
        <div className="max-w-xl">
          <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1">
            Volver
          </button>
          <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
            <h2 className="font-bold text-lg">Nuevo ticket de soporte</h2>
            <div>
              <Label className="text-sm mb-1.5 block">Asunto</Label>
              <Input placeholder="Describe brevemente el problema" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-ticket-subject" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Descripcion detallada</Label>
              <Textarea placeholder="Proporciona todos los detalles posibles..." value={message} onChange={(e) => setMessage(e.target.value)} rows={6} data-testid="textarea-ticket-message" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setView("list")}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createTicket.isPending} data-testid="btn-submit-ticket">
                {createTicket.isPending ? "Enviando..." : "Crear ticket"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {view === "chat" && (
        <div className="max-w-2xl">
          <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground mb-6">Volver a tickets</button>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-secondary/30">
              <p className="font-semibold text-sm">Conversacion</p>
            </div>
            <div className="h-96 overflow-y-auto p-5 space-y-4">
              {messages?.map((m) => (
                <div key={m.id} className={`flex ${m.isStaff ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-xl text-sm ${m.isStaff ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground"}`}>
                    {m.isStaff && <p className="text-xs font-bold mb-1 text-primary">[Soporte] {m.username}</p>}
                    {m.content}
                    <p className="text-xs mt-1 opacity-60">{new Date(m.createdAt).toLocaleTimeString("es")}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border flex gap-3">
              <Input placeholder="Escribe un mensaje..." value={chatMsg} onChange={(e) => setChatMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} data-testid="input-support-message" />
              <Button onClick={handleSend} disabled={sendMessage.isPending} data-testid="btn-send-message">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
