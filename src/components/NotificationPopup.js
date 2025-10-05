import React, { useMemo, useState } from "react";

export default function NotificationPopup({ notifications, onClose, onMarkAllRead, onNotificationClick }) {
  const pageSize = 8;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil((notifications?.length || 0) / pageSize));
  const pageItems = useMemo(() => notifications.slice(page * pageSize, (page + 1) * pageSize), [notifications, page]);

  return (
    <div className="fixed left-1/2 bottom-24 -translate-x-1/2 w-80 max-w-xs z-50">
      <div className="login-card-glass">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-[#2d3748]">Notifications</span>
          <button onClick={onMarkAllRead} className="text-sm text-emerald-700 hover:underline">
            Mark all as read
          </button>
        </div>
        <div className="max-h-60 overflow-y-auto rounded-lg">
          {pageItems.length === 0 ? (
            <div className="p-4 text-center text-[#4a5568]">No notifications</div>
          ) : (
            pageItems.map((n) => (
              <div
                key={n.id}
                className={`px-3 py-2 rounded-lg mb-1 cursor-pointer transition ${n.read ? "bg-white/70" : "bg-amber-100/80"} hover:bg-amber-100`}
                onClick={() => { onNotificationClick && onNotificationClick(n); onClose(); }}
              >
                {n.text}
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="text-sm text-[#4a5568] disabled:opacity-50">Prev</button>
          <span className="text-xs text-[#4a5568]">{page + 1} / {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(p => Math.min(pages - 1, p + 1))} className="text-sm text-[#4a5568] disabled:opacity-50">Next</button>
        </div>
        <div className="mt-2 text-right">
          <button onClick={onClose} className="text-sm text-[#4a5568] hover:text-black">Close</button>
        </div>
      </div>
    </div>
  );
}
