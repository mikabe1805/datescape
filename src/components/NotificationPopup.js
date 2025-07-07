import React from "react";

export default function NotificationPopup({ notifications, onClose, onMarkAllRead }) {
  return (
    <div className="absolute right-0 mt-2 w-72 bg-white text-black shadow-lg rounded-xl z-50">
      <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
        <span className="font-semibold">Notifications</span>
        <button onClick={onMarkAllRead} className="text-sm text-blue-500 hover:underline">
          Mark all as read
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No notifications</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-2 border-b border-gray-100 ${
                n.read ? "bg-white" : "bg-yellow-50"
              }`}
            >
              {n.text}
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-2 text-right">
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-black">
          Close
        </button>
      </div>
    </div>
  );
}
