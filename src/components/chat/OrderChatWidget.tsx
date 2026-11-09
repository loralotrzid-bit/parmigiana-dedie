import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { fetchChatMessages, sendChatMessage, subscribeToChatMessages } from "@/services/chatService";
import { useChatNotificationSound } from "@/hooks/useChatNotificationSound";
import type { Tables } from "@/integrations/supabase/types";

interface OrderChatWidgetProps {
  orderId: string;
  senderType: "client" | "restaurant" | "driver";
  senderId: string;
  /** If true, render inline (no floating button). Otherwise render as a floating panel. */
  inline?: boolean;
}

const OrderChatWidget = ({ orderId, senderType, senderId, inline }: OrderChatWidgetProps) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Tables<"chat_messages">[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const playMessageSound = useChatNotificationSound();

  useEffect(() => {
    if (!open) return;
    fetchChatMessages(orderId).then((msgs) => {
      setMessages(msgs);
      setUnread(0);
    });
  }, [open, orderId]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeToChatMessages(orderId, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Play sound + browser notification for messages from others
      if (msg.sender_type !== senderType) {
        playMessageSound();
        // Browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          const senderName = msg.sender_type === "client" ? "Client" : msg.sender_type === "restaurant" ? "Restaurant" : "Livreur";
          try {
            new Notification(`💬 ${senderName}`, {
              body: msg.message.length > 80 ? msg.message.slice(0, 80) + "…" : msg.message,
              tag: `chat-${msg.id}`,
              requireInteraction: false,
            });
          } catch { /* notification API may not be available */ }
        }
      }
      if (!open) setUnread((u) => u + 1);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return unsub;
  }, [orderId, open, senderType, playMessageSound]);

  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
  }, [open]);

  const handleSend = async () => {
    if (!text.trim() || sending || !senderId) return;
    setSending(true);
    try {
      await sendChatMessage(orderId, senderType, senderId, text.trim(), senderType === "driver" ? "driver" : "restaurant");
      setText("");
    } catch (e) {
      console.error("Chat send error:", e);
    }
    setSending(false);
  };

  const senderLabel = (type: string) => {
    switch (type) {
      case "client": return "Client";
      case "restaurant": return "Restaurant";
      case "driver": return "Livreur";
      default: return type;
    }
  };

  const isMe = (msg: Tables<"chat_messages">) => msg.sender_type === senderType;

  // Inline toggle button
  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setUnread(0); }}
        className="relative flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
            {unread}
          </span>
        )}
      </button>
    );
  }

  const chatPanel = (
    <div className={inline
      ? "mt-2 rounded-xl border bg-card shadow-card overflow-hidden"
      : "fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
    }>
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Chat</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className={`overflow-y-auto px-3 py-2 space-y-1.5 ${inline ? "max-h-60" : "flex-1"}`}>
        {messages.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground py-6">Aucun message</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${isMe(msg) ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
              isMe(msg)
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
            }`}>
              {!isMe(msg) && (
                <p className="text-[9px] font-bold mb-0.5 opacity-70">{senderLabel(msg.sender_type)}</p>
              )}
              <p>{msg.message}</p>
              <p className={`text-[9px] mt-0.5 ${isMe(msg) ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Écrire un message…"
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return chatPanel;
};

export default OrderChatWidget;
