import React, { useMemo } from "react";
import { Bell, CheckCheck, X } from "lucide-react";

function formatTimestamp(timestamp) {
  const value = timestamp?.seconds ? timestamp.seconds * 1000 : timestamp?.toMillis?.();
  if (!value) return "Just now";

  const diffMinutes = Math.round((Date.now() - value) / 60000);
  if (diffMinutes <= 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return new Date(value).toLocaleDateString();
}

export default function NotificationPopup({ notifications, onClose, onMarkAllRead, onNotificationClick }) {
  const items = useMemo(() => (notifications || []).slice(0, 10), [notifications]);
  const unreadCount = useMemo(
    () => (notifications || []).reduce((count, notification) => count + (notification.read ? 0 : 1), 0),
    [notifications]
  );

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#10201a]/96 text-amber-50 shadow-[0_22px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-amber-200">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-100">Notifications</p>
            <p className="text-xs text-white/55">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 rounded-xl bg-white/8 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-white/12 disabled:opacity-50"
            disabled={unreadCount === 0}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white/70 transition hover:bg-white/12 hover:text-white"
            aria-label="Close notifications"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-h-[22rem] overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center">
            <p className="text-sm font-medium text-amber-100">Nothing new right now.</p>
            <p className="mt-1 text-xs text-white/55">New matches and messages will show up here.</p>
          </div>
        ) : (
          items.map((notification) => (
            <button
              key={notification.id}
              className={`mb-2 flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                notification.read
                  ? "border-white/8 bg-white/5 hover:bg-white/8"
                  : "border-amber-300/20 bg-amber-300/10 hover:bg-amber-300/14"
              }`}
              onClick={() => {
                onNotificationClick?.(notification);
                onClose();
              }}
            >
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                  notification.read ? "bg-white/20" : "bg-amber-300"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-amber-50">{notification.text}</span>
                <span className="mt-1 block text-xs text-white/55">
                  {formatTimestamp(notification.timestamp)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
