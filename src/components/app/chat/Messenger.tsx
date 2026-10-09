import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, ChevronRight, Minus, MessageCircle, MoreVertical, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getChatDirectory } from "@/lib/chat.functions";
import {
  CHAT_MAX_LENGTH,
  contactAgencyLabel,
  PLATFORM_LABEL,
  PLATFORM_ORG_ID,
  groupContacts,
  lastSeenLabel,
  normalizeChatBody,
  openWindow,
  type ChatContact,
} from "@/lib/chat/chat-rules";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CurrentUser } from "@/hooks/use-session";
import { useAvatarUrl } from "@/components/app/UserAvatar";
import { useIsMobile } from "@/hooks/use-mobile";

/** Înălțimea vizibilă reală (scade când apare tastatura pe iOS/Android). */
function useVisualViewport(active: boolean) {
  const [vp, setVp] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const update = () =>
      setVp({ height: vv ? vv.height : window.innerHeight, top: vv ? vv.offsetTop : 0 });
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return active && vp ? { height: `${vp.height}px`, top: `${vp.top}px` } : undefined;
}

type Conv = {
  conversation_id: string;
  other_user_id: string;
  unread: number;
  last_message_at: string | null;
  i_blocked: boolean;
  blocked_me: boolean;
};
type Msg = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };

const STORE_KEY = "habitoo-chat-ui";
type UiState = { panel: boolean; windows: string[]; minimized: string[]; collapsed: string[] };
const EMPTY: UiState = { panel: false, windows: [], minimized: [], collapsed: [] };

function useUiState() {
  const [state, setState] = useState<UiState>(EMPTY);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as UiState) });
    } catch {
      /* ignore */
    }
  }, []);
  const update = useCallback((fn: (s: UiState) => UiState) => {
    setState((s) => {
      const next = fn(s);
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [state, update] as const;
}

function Avatar({ name, url, online, size = "size-8" }: { name: string; url: string | null; online?: boolean; size?: string }) {
  return (
    <span className={cn("relative shrink-0", size)}>
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {url ? <img src={url} alt={`Fotografia lui ${name}`} className="size-full object-cover" loading="lazy" /> : initials(name)}
      </span>
      {online !== undefined ? (
        <span
          aria-label={online ? "Online" : "Offline"}
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface",
            online ? "bg-success" : "bg-muted-foreground/40",
          )}
        />
      ) : null}
    </span>
  );
}

export function Messenger({ user }: { user: CurrentUser }) {
  const me = user.userId;
  const qc = useQueryClient();
  const [ui, setUi] = useUiState();
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState(false);
  const [search, setSearch] = useState("");
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const fetchDirectory = useServerFn(getChatDirectory);
  const directory = useQuery({
    queryKey: ["chat-directory"],
    queryFn: () => fetchDirectory(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const convs = useQuery({
    queryKey: ["chat-convs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("chat_my_conversations");
      if (error) throw error;
      return (data ?? []) as Conv[];
    },
  });
  const convByUser = useMemo(() => {
    const m = new Map<string, Conv>();
    for (const c of convs.data ?? []) m.set(c.other_user_id, c);
    return m;
  }, [convs.data]);
  const convToUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of convs.data ?? []) m.set(c.conversation_id, c.other_user_id);
    return m;
  }, [convs.data]);
  const convToUserRef = useRef(convToUser);
  convToUserRef.current = convToUser;

  // Prezență realtime + „văzut ultima dată” persistat.
  useEffect(() => {
    const channel = supabase.channel("chat-presence", { config: { presence: { key: me } } });
    channel
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });
    const touch = () => void supabase.rpc("chat_touch_presence");
    touch();
    const t = window.setInterval(touch, 60_000);
    window.addEventListener("beforeunload", touch);
    return () => {
      touch();
      window.clearInterval(t);
      window.removeEventListener("beforeunload", touch);
      void supabase.removeChannel(channel);
    };
  }, [me]);

  // Mesaje noi în timp real (RLS livrează doar conversațiile mele).
  useEffect(() => {
    const channel = supabase
      .channel(`chat-db-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new as Msg;
        void qc.invalidateQueries({ queryKey: ["chat-msgs", m.conversation_id] });
        void qc.invalidateQueries({ queryKey: ["chat-convs"] });
        if (m.sender_id === me) return;
        const other = convToUserRef.current.get(m.conversation_id);
        const s = uiRef.current;
        const visible = other && s.windows.includes(other) && !s.minimized.includes(other);
        if (!visible) {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 1800);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_participants" }, () => {
        void qc.invalidateQueries({ queryKey: ["chat-convs"] });
      })
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [me, qc]);

  const contacts: ChatContact[] = useMemo(
    () =>
      (directory.data ?? [])
        .filter((d) => d.userId !== me)
        .map((d) => {
          const c = convByUser.get(d.userId);
          return {
            ...d,
            online: online.has(d.userId),
            unread: c?.unread ?? 0,
            lastMessageAt: c?.last_message_at ?? null,
          };
        }),
    [directory.data, convByUser, online, me],
  );
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.userId, c])), [contacts]);
  const groups = useMemo(
    () => groupContacts(contacts, user.isSuperadmin ? PLATFORM_ORG_ID : (user.organization?.id ?? null), search),
    [contacts, user.organization?.id, search],
  );
  const totalUnread = (convs.data ?? []).reduce((s, c) => s + c.unread, 0);
  const myAvatar = useAvatarUrl(user.profile?.avatar_url);
  const myName = user.profile?.full_name || user.email || "Eu";

  const isMobile = useIsMobile();
  const mobileConv =
    isMobile && ui.windows[0] && !ui.minimized.includes(ui.windows[0]) ? ui.windows[0] : null;
  const mobileOpen = isMobile && (ui.panel || mobileConv !== null);
  const vpStyle = useVisualViewport(mobileOpen);
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const openChat = (userId: string) =>
    setUi((s) => ({ ...s, windows: openWindow(s.windows, userId), minimized: s.minimized.filter((x) => x !== userId) }));

  return (
    <>
      {!ui.panel && !mobileConv ? (
        <button
          type="button"
          onClick={() => setUi((s) => ({ ...s, panel: true }))}
          className={cn(
            "fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex size-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-lg transition-transform md:right-4 md:bottom-20 md:size-auto md:h-11 md:px-4 lg:bottom-5",
            flash && "animate-pulse ring-4 ring-primary/40",
          )}
          aria-label={`Mesaje${totalUnread ? `, ${totalUnread} necitite` : ""}`}
        >
          <MessageCircle className="size-5 md:size-4" />
          <span className="max-md:sr-only">Mesaje</span>
          {totalUnread ? (
            <span className="rounded-full bg-destructive px-1.5 text-[11px] leading-5 text-destructive-foreground max-md:absolute max-md:-top-1 max-md:-right-1 max-md:min-w-5 max-md:text-center">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          ) : null}
        </button>
      ) : null}
      {ui.panel && !mobileConv ? (
        <aside
          style={vpStyle}
          aria-label="Mesaje"
          className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col overflow-x-hidden border-l border-border bg-surface md:inset-auto md:top-16 md:right-0 md:bottom-0 md:z-40 md:w-80 md:shadow-xl"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pr-1.5 pl-4 md:hidden">
            <h2 className="text-base font-semibold">Mesaje</h2>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              onClick={() => setUi((s) => ({ ...s, panel: false }))}
              aria-label="Închide mesajele"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 border-b border-border p-3 max-md:hidden">
            <Avatar name={myName} url={myAvatar} online />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{myName}</p>
              <p className="truncate text-xs text-muted-foreground">{user.isSuperadmin ? PLATFORM_LABEL : user.organization?.name}</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setUi((s) => ({ ...s, panel: false }))}
              aria-label="Închide lista de mesaje"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="border-b border-border p-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Caută agent sau agenție"
                aria-label="Caută agent sau agenție"
                className="h-11 w-full rounded-md border border-input bg-background pr-2 pl-8 text-base md:h-9 md:text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {directory.isLoading ? <p className="p-4 text-sm text-muted-foreground">Se încarcă…</p> : null}
            {directory.isError ? <p className="p-4 text-sm text-destructive">Lista nu a putut fi încărcată.</p> : null}
            {groups.map((g) => {
              const collapsed = ui.collapsed.includes(g.organizationId) && !search;
              const onlineCount = g.contacts.filter((c) => c.online).length;
              return (
                <section key={g.organizationId}>
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={() =>
                      setUi((s) => ({
                        ...s,
                        collapsed: s.collapsed.includes(g.organizationId)
                          ? s.collapsed.filter((x) => x !== g.organizationId)
                          : [...s.collapsed, g.organizationId],
                      }))
                    }
                    className="flex min-h-11 w-full items-center gap-1 px-3 pt-3 pb-1 md:min-h-0 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                  >
                    {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    <span className="truncate">{g.organizationName}</span>
                    <span className="ml-auto font-normal normal-case">
                      {onlineCount}/{g.contacts.length}
                    </span>
                  </button>
                  {collapsed ? null : (
                    <ul>
                      {g.contacts.map((c) => (
                        <li key={c.userId}>
                          <button
                            type="button"
                            onClick={() => openChat(c.userId)}
                            className="flex min-h-14 w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted md:min-h-0"
                          >
                            <Avatar name={c.fullName} url={c.avatarUrl} online={c.online} />
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate text-sm", c.unread && "font-semibold")}>{c.fullName}</span>
                              <span className="block truncate text-xs text-muted-foreground">{contactAgencyLabel(c)}</span>
                            </span>
                            {c.unread ? (
                              <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground">
                                {c.unread}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            {!directory.isLoading && groups.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Niciun contact găsit.</p>
            ) : null}
          </div>
        </aside>
      ) : null}

      {(isMobile ? (mobileConv ? [mobileConv] : []) : ui.windows).map((uid, i) => {
        const contact = contactById.get(uid);
        if (!contact) return null;
        return (
          <ChatWindow
            key={uid}
            me={me}
            contact={contact}
            conv={convByUser.get(uid) ?? null}
            index={i}
            panelOpen={ui.panel}
            minimized={ui.minimized.includes(uid)}
            mobile={isMobile}
            mobileStyle={vpStyle}
            onBack={() =>
              setUi((s) => ({ ...s, panel: true, windows: s.windows.filter((x) => x !== uid) }))
            }
            onToggleMin={() =>
              setUi((s) => ({
                ...s,
                minimized: s.minimized.includes(uid) ? s.minimized.filter((x) => x !== uid) : [...s.minimized, uid],
              }))
            }
            onClose={() =>
              setUi((s) => ({
                ...s,
                windows: s.windows.filter((x) => x !== uid),
                minimized: s.minimized.filter((x) => x !== uid),
              }))
            }
          />
        );
      })}
    </>
  );
}

function ChatWindow({
  me,
  contact,
  conv,
  index,
  panelOpen,
  minimized,
  onToggleMin,
  onClose,
  mobile,
  mobileStyle,
  onBack,
}: {
  mobile: boolean;
  mobileStyle?: React.CSSProperties;
  onBack: () => void;
  me: string;
  contact: ChatContact;
  conv: Conv | null;
  index: number;
  panelOpen: boolean;
  minimized: boolean;
  onToggleMin: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [convId, setConvId] = useState<string | null>(conv?.conversation_id ?? null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conv?.conversation_id) {
      setConvId(conv.conversation_id);
      return;
    }
    let alive = true;
    void supabase.rpc("chat_open_conversation", { _other: contact.userId }).then(({ data, error }) => {
      if (!alive) return;
      if (error) toast.error("Conversația nu a putut fi deschisă.");
      else {
        setConvId(data as string);
        void qc.invalidateQueries({ queryKey: ["chat-convs"] });
      }
    });
    return () => {
      alive = false;
    };
  }, [conv?.conversation_id, contact.userId, qc]);

  const msgs = useQuery({
    queryKey: ["chat-msgs", convId],
    enabled: Boolean(convId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id,conversation_id,sender_id,body,created_at")
        .eq("conversation_id", convId as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as Msg[]).reverse();
    },
  });

  const count = msgs.data?.length ?? 0;
  useEffect(() => {
    if (minimized) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    if (!convId || !conv?.unread) return;
    void supabase
      .from("chat_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", convId)
      .eq("user_id", me)
      .then(() => qc.invalidateQueries({ queryKey: ["chat-convs"] }));
  }, [count, minimized, convId, conv?.unread, me, qc]);

  const send = async () => {
    const body = normalizeChatBody(text);
    if (!body || !convId || sending) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({ conversation_id: convId, sender_id: me, body });
    setSending(false);
    if (error) {
      toast.error(conv?.blocked_me ? "Nu mai poți trimite mesaje în această conversație." : "Mesajul nu a fost trimis.");
      return;
    }
    setText("");
    void qc.invalidateQueries({ queryKey: ["chat-msgs", convId] });
  };

  const toggleBlock = async () => {
    if (!convId) return;
    const { error } = await supabase
      .from("chat_participants")
      .update({ blocked_at: conv?.i_blocked ? null : new Date().toISOString() })
      .eq("conversation_id", convId)
      .eq("user_id", me);
    if (error) toast.error("Acțiunea nu a reușit.");
    else {
      toast.success(conv?.i_blocked ? "Utilizator deblocat." : "Utilizator blocat.");
      void qc.invalidateQueries({ queryKey: ["chat-convs"] });
    }
  };

  const right = (panelOpen ? 320 : 0) + 16 + index * 332;
  const blockedMe = conv?.blocked_me === true;

  return (
    <div
      role="dialog"
      aria-label={`Conversație cu ${contact.fullName}`}
      style={{ ["--chat-right" as string]: `${right}px`, ...(mobile ? mobileStyle : {}) }}
      className={cn(
        "fixed inset-x-0 top-0 z-[60] flex h-[100dvh] flex-col overflow-x-hidden bg-surface md:inset-auto md:right-[var(--chat-right)] md:bottom-0 md:z-40 md:w-80 md:rounded-t-lg md:border md:border-border md:shadow-xl",
        minimized ? "max-md:hidden md:h-12" : "md:h-[420px]",
        index > 0 && "max-md:hidden",
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1.5 md:gap-2 md:px-2.5 md:py-2">
        {mobile ? (
          <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted" onClick={onBack} aria-label="Înapoi la listă">
            <ArrowLeft className="size-5" />
          </button>
        ) : null}
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={mobile ? undefined : onToggleMin}>
          <Avatar name={contact.fullName} url={contact.avatarUrl} online={contact.online} size="size-7" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{contact.fullName}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {contactAgencyLabel(contact)} · {contact.online ? "Online" : lastSeenLabel(contact.lastSeenAt)}
            </span>
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted max-md:size-11" aria-label="Opțiuni conversație">
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void toggleBlock()}>
              {conv?.i_blocked ? "Deblochează" : "Blochează"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted max-md:hidden" onClick={onToggleMin} aria-label={minimized ? "Extinde" : "Minimizează"}>
          <Minus className="size-4" />
        </button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted max-md:hidden" onClick={onClose} aria-label="Închide conversația">
          <X className="size-4" />
        </button>
      </div>
      {minimized ? null : (
        <>
          <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {msgs.data?.length === 0 ? (
              <p className="pt-6 text-center text-xs text-muted-foreground">Scrie primul mesaj.</p>
            ) : null}
            {msgs.data?.map((m) => {
              const mine = m.sender_id === me;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
                      mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground",
                    )}
                  >
                    {m.body}
                    <span className={cn("mt-0.5 block text-right text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {new Date(m.created_at).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {conv?.i_blocked ? (
            <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">Ai blocat acest utilizator.</p>
          ) : null}
          {blockedMe ? (
            <p className="border-t border-border p-3 text-xs text-muted-foreground">
              Nu mai poți trimite mesaje în această conversație.
            </p>
          ) : (
            <form
              className="flex shrink-0 items-end gap-1.5 border-t border-border p-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                autoFocus={!mobile}
                rows={1}
                value={text}
                maxLength={CHAT_MAX_LENGTH}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (!mobile && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Scrie un mesaj…"
                aria-label="Mesaj"
                className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-2 text-base md:min-h-9 md:text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary md:size-9 text-primary-foreground disabled:opacity-50"
                aria-label="Trimite"
              >
                <Send className="size-4" />
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
