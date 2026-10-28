import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, Send } from "lucide-react";
import { normalizeApiError } from "../../services/api/error";
import { useAppDispatch } from "../../app/hooks";
import {
  type ChatMessage,
  type ChatPage,
  type LeagueMember,
  knoxitApi,
  useDeleteChatMessageMutation,
  useMarkChatReadMutation,
  useReportChatMessageMutation,
  useSendChatMessageMutation,
  useSetChatMuteMutation,
  useToggleChatReactionMutation,
} from "../../services/api/knoxitApi";
import { insertMention, mentionQuery, mergeMessages, prependMessages, splitMentions, toggleReactionLocally } from "./chatMessages";
import { usePollWhileVisible } from "./usePollWhileVisible";

const REACTIONS = ["😂", "🔥", "😭", "👏"];
const POLL_MS = 4_000;
const MAX_LENGTH = 500;

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

// Message text is always rendered as React text nodes, so any HTML a player
// types shows literally and never runs.
function MessageText({ content, usernames }: { content: string; usernames: string[] }) {
  return (
    <>
      {splitMentions(content, usernames).map((segment, index) =>
        segment.mention ? (
          <span key={index} className="font-semibold text-[var(--theme-primary)]">{segment.text}</span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
}

export function LeagueChat({
  leagueId,
  members,
  currentUserId,
  onOpenProfile,
}: {
  leagueId: string;
  members: LeagueMember[];
  currentUserId: string | undefined;
  onOpenProfile: (userId: string) => void;
}) {
  const dispatch = useAppDispatch();
  // Each chat request is independent (polls overlap "Load earlier"). A shared
  // lazy-query hook drops an earlier request's result when a newer one starts,
  // and chat pages aren't cached, so hold a subscription only until the
  // result has been read.
  const fetchPage = useCallback(
    async (args: { leagueId: string; before?: string; after?: string }): Promise<ChatPage> => {
      const request = dispatch(knoxitApi.endpoints.getChatPage.initiate(args, { forceRefetch: true }));
      try {
        const page = await request.unwrap();
        if (!page) throw new Error("Chat could not be loaded");
        return page;
      } finally {
        request.unsubscribe();
      }
    },
    [dispatch]
  );
  const [sendMessage, sendState] = useSendChatMessageMutation();
  const [toggleReaction] = useToggleChatReactionMutation();
  const [reportMessage] = useReportChatMessageMutation();
  const [deleteMessage] = useDeleteChatMessageMutation();
  const [setMute] = useSetChatMuteMutation();
  const [markRead] = useMarkChatReadMutation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [mutedUserIds, setMutedUserIds] = useState<string[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openActions, setOpenActions] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const pollingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const preserveScrollFrom = useRef<number | null>(null);

  const usernames = members.map((member) => member.username);
  const statusByUser = new Map(members.map((member) => [member.userId, member.status]));

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchPage({ leagueId });
      cursorRef.current = page.cursor;
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setMutedUserIds(page.mutedUserIds);
      setCanModerate(page.canModerate);
      stickToBottom.current = true;
      void markRead(leagueId);
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, leagueId, markRead]);

  const poll = useCallback(async () => {
    if (pollingRef.current || !cursorRef.current) return;
    pollingRef.current = true;
    try {
      const page = await fetchPage({ leagueId, after: cursorRef.current });
      cursorRef.current = page.cursor;
      setMutedUserIds(page.mutedUserIds);
      setCanModerate(page.canModerate);
      if (page.messages.length) {
        setMessages((current) => mergeMessages(current, page.messages));
        void markRead(leagueId);
      }
    } catch {
      // A missed poll is retried on the next tick.
    } finally {
      pollingRef.current = false;
    }
  }, [fetchPage, leagueId, markRead]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  usePollWhileVisible(() => void poll(), POLL_MS, !loading);

  // Keep the view pinned to the newest message unless the reader scrolled up;
  // keep their place when an earlier page is added on top.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (preserveScrollFrom.current !== null) {
      list.scrollTop = list.scrollHeight - preserveScrollFrom.current;
      preserveScrollFrom.current = null;
    } else if (stickToBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const loadEarlier = async () => {
    const oldest = messages[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await fetchPage({ leagueId, before: oldest.createdAt });
      preserveScrollFrom.current = listRef.current ? listRef.current.scrollHeight - listRef.current.scrollTop : null;
      setMessages((current) => prependMessages(current, page.messages));
      setHasMore(page.hasMore);
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setLoadingEarlier(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sendState.isLoading) return;
    setError(null);
    try {
      const message = await sendMessage({ leagueId, content }).unwrap();
      setDraft("");
      stickToBottom.current = true;
      setMessages((current) => mergeMessages(current, [message]));
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    }
  };

  const runAction = async (action: () => Promise<unknown>, success?: string) => {
    setOpenActions(null);
    setError(null);
    try {
      await action();
      if (success) setNotice(success);
      await poll();
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    }
  };

  const react = (messageId: string, emoji: string) => {
    setOpenActions(null);
    setMessages((current) => toggleReactionLocally(current, messageId, emoji));
    toggleReaction({ leagueId, messageId, emoji })
      .unwrap()
      .catch((requestError) => {
        // Undo the optimistic toggle if the server refused it.
        setMessages((current) => toggleReactionLocally(current, messageId, emoji));
        setError(normalizeApiError(requestError).message);
      });
  };
  const mention = mentionQuery(draft, caret);
  const suggestions = mention
    ? members
        .filter((member) => member.userId !== currentUserId && member.username.toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 5)
    : [];

  const chooseMention = (username: string) => {
    const next = insertMention(draft, caret, username);
    setDraft(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const mutedMembers = members.filter((member) => mutedUserIds.includes(member.userId));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {mutedMembers.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-1.5 text-[10px] text-zinc-500">
          Muted:
          {mutedMembers.map((member) => (
            <button
              key={member.userId}
              onClick={() => void runAction(() => setMute({ leagueId, userId: member.userId, muted: false }).unwrap(), `Unmuted ${member.username}`).then(loadLatest)}
              className="rounded-full border border-white/10 px-2 py-0.5 text-zinc-300"
            >
              {member.username} · Unmute
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3"
        aria-live="polite"
      >
        {hasMore ? (
          <button onClick={() => void loadEarlier()} disabled={loadingEarlier} className="mx-auto block rounded-full border border-white/10 px-3 py-1 text-[11px] text-zinc-400">
            {loadingEarlier ? "Loading…" : "Load earlier messages"}
          </button>
        ) : null}
        {loading ? <div className="pt-10 text-center text-[12px] text-zinc-500">Loading chat…</div> : null}
        {!loading && messages.length === 0 ? (
          <div className="pt-10 text-center text-[12px] text-zinc-500">No messages yet. Say hello!</div>
        ) : null}

        {messages.map((message) => {
          if (message.kind === "system") {
            return (
              <div key={message.id} data-kind="system" className="text-center text-[11px] italic text-zinc-500">
                {message.content}
              </div>
            );
          }
          const mine = message.userId === currentUserId;
          const status = message.userId ? statusByUser.get(message.userId) ?? message.authorStatus : null;
          return (
            <div key={message.id} data-message-id={message.id} className="group">
              <div className="flex items-baseline gap-1.5">
                <button
                  onClick={() => message.userId && onOpenProfile(message.userId)}
                  className="text-[12px] font-semibold text-white"
                >
                  {message.username ?? "Player"}{mine ? " (you)" : ""}
                </button>
                {status === "knocked_out" ? (
                  <span className="rounded border border-red-500/30 bg-red-500/10 px-1 text-[9px] font-bold text-red-300">OUT</span>
                ) : null}
                <span className="text-[10px] text-zinc-600">{formatTime(message.createdAt)}</span>
                {!message.deleted ? (
                  <button
                    onClick={() => setOpenActions(openActions === message.id ? null : message.id)}
                    aria-label="Message actions"
                    className="ml-auto text-zinc-600"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                ) : null}
              </div>
              <div className={`whitespace-pre-wrap break-words text-[13px] leading-snug ${message.deleted ? "italic text-zinc-600" : "text-zinc-200"}`}>
                {message.deleted ? "Message removed by a league admin" : <MessageText content={message.content} usernames={usernames} />}
              </div>

              {message.reactions.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {message.reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      onClick={() => react(message.id, reaction.emoji)}
                      aria-pressed={reaction.mine}
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] ${reaction.mine ? "border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)]" : "border-white/10 bg-white/[0.03]"}`}
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                </div>
              ) : null}

              {openActions === message.id ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 p-1.5" role="menu">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      role="menuitem"
                      onClick={() => react(message.id, emoji)}
                      className="rounded-md px-1.5 py-0.5 text-[15px] hover:bg-white/5"
                    >
                      {emoji}
                    </button>
                  ))}
                  {!mine && message.userId ? (
                    <>
                      <button
                        role="menuitem"
                        onClick={() => void runAction(() => reportMessage({ leagueId, messageId: message.id }).unwrap(), "Reported. Thanks — our team will review it.")}
                        className="rounded-md px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5"
                      >
                        Report
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => void runAction(() => setMute({ leagueId, userId: message.userId!, muted: true }).unwrap(), `Muted ${message.username}. You won't see their messages.`).then(loadLatest)}
                        className="rounded-md px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5"
                      >
                        Mute user
                      </button>
                    </>
                  ) : null}
                  {canModerate ? (
                    <button
                      role="menuitem"
                      onClick={() => void runAction(() => deleteMessage({ leagueId, messageId: message.id }).unwrap())}
                      className="rounded-md px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/5 px-3 pb-2 pt-2">
        {notice ? (
          <button onClick={() => setNotice(null)} className="mb-1.5 block w-full text-left text-[11px] text-emerald-300">{notice}</button>
        ) : null}
        {error ? <div role="alert" className="mb-1.5 text-[11px] text-red-300">{error}</div> : null}
        {suggestions.length ? (
          <div className="mb-1.5 flex flex-wrap gap-1" role="listbox" aria-label="Mention a player">
            {suggestions.map((member) => (
              <button
                key={member.userId}
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseMention(member.username)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-200"
              >
                @{member.username}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            maxLength={MAX_LENGTH}
            rows={1}
            placeholder="Message the league…"
            aria-label="Message"
            onChange={(event) => {
              setDraft(event.target.value);
              setCaret(event.target.selectionStart ?? event.target.value.length);
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            className="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:border-[var(--theme-primary-ring)] focus:outline-none"
          />
          <button
            onClick={() => void send()}
            disabled={!draft.trim() || sendState.isLoading}
            aria-label="Send"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-[var(--theme-primary)] text-[var(--theme-primary-text)] disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>
        {draft.length > MAX_LENGTH - 50 ? (
          <div className="mt-1 text-right text-[10px] text-zinc-500">{draft.length}/{MAX_LENGTH}</div>
        ) : null}
      </div>
    </div>
  );
}
