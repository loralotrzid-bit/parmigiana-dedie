import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, X, Store, Truck } from "lucide-react";
import { fetchChatMessages, sendChatMessage, subscribeToChatMessages } from "@/services/chatService";
import { useChatNotificationSound } from "@/hooks/useChatNotificationSound";
import { useAuth } from "@/contexts/useAuth";
import type { Tables } from "@/integrations/supabase/types";

interface OrderChatProps {
  orderId: string;
  orderStatus: string;
  orderType: string;
  hasDriver: boolean;
}

type ChatTarget = "restaurant" | "driver";

const OrderChat = ({ orderId, orderStatus, orderType, hasDriver }: OrderChatProps) => {
  const playMessageSound = useChatNotificationSound();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ChatTarget>("restaurant");
  const [allMessages, setAllMessages] = useState<Tables<"chat_messages">[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [unreadRestaurant, setUnreadRestaurant] = useState(0);
  const [unreadDriver, setUnreadDriver] = useState(0);
  const { user } = useAuth();

  const isFinished = ["delivered", "cancelled"].includes(orderStatus);
  const canChatRestaurant = !isFinished;
  const canChatDriver = orderType === "delivery" && hasDriver && ["in_delivery", "in_transit", "picked_up"].includes(orderStatus);

  // Filter messages by target_type for proper separation
  const messages = allMessages.filter((m) => m.target_type === target);

  const totalUnread = unreadRestaurant + unreadDriver;

  useEffect(() => {
    setUserId(user?.id ?? "");
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    fetchChatMessages(orderId).then((msgs) => {
      setAllMessages(msgs);
      setUnreadRestaurant(0);
      setUnreadDriver(0);
    });
  }, [open, orderId]);

  useEffect(() => {
    if (open && target === "restaurant") setUnreadRestaurant(0);
    if (open && target === "driver") setUnreadDriver(0);
  }, [open, target]);

  useEffect(() => {
    const unsub = subscribeToChatMessages(orderId, (msg) => {
      setAllMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      const msgTarget = msg.target_type || (msg.sender_type === "driver" ? "driver" : "restaurant");
      
      // Play sound for messages from others
      if (msg.sender_type !== "client") {
        playMessageSound();
      }
      
      if (msgTarget === "restaurant" && msg.sender_type !== "client") {
        if (!open || target !== "restaurant") setUnreadRestaurant((u) => u + 1);
      } else if (msgTarget === "driver" && msg.sender_type !== "client") {
        if (!open || target !== "driver") setUnreadDriver((u) => u + 1);
      }

      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return unsub;
  }, [orderId, open, target, playMessageSound]);

  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
  }, [open, target]);

  const handleSend = async () => {
    if (!text.trim() || sending || !userId) return;
    setSending(true);
    try {
      await sendChatMessage(orderId, "client", userId, text.trim(), target);
      setText("");
    } catch (e) {
      console.error("Chat send error:", e);
    }
    setSending(false);
  };

  if (!canChatRestaurant && !canChatDriver) return null;

  const tabs: { key: ChatTarget; label: string; icon: typeof Store; enabled: boolean; unread: number }[] = [
    { key: "restaurant", label: "Restaurant", icon: Store, enabled: canChatRestaurant, unread: unreadRestaurant },
    { key: "driver", label: "Livreur", icon: Truck, enabled: canChatDriver, unread: unreadDriver },
  ];

  return (
    <>
      {/* Floating chat button — z-[1100] to be above Leaflet map layers */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-[1100] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          <MessageSquare className="h-6 w-6" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel — z-[1200] to be above Leaflet (z-index up to ~1000) */}
      {open && (
        <div className="fixed inset-0 z-[1200] flex flex-col bg-background">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between border-b bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">Messages</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 flex border-b bg-card px-2">
            {tabs.filter((t) => t.enabled).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setTarget(tab.key)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                    target === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.unread > 0 && (
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                      {tab.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">
                Aucun message. Envoyez le premier !
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_type === "client";
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    {!isMe && (
                      <p className="text-[10px] font-bold mb-0.5 opacity-70">
                        {msg.sender_type === "restaurant" ? "Restaurant" : "Livreur"}
                      </p>
                    )}
                    <p>{msg.message}</p>
                    <p className={`text-[10px] mt-0.5 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={`Message au ${target === "restaurant" ? "restaurant" : "livreur"}…`}
                className="flex-1 rounded-xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrderChat;
