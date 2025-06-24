// components/MatchOptionsMenu.jsx
import { useState } from "react";
import { FiMoreHorizontal } from "react-icons/fi";  // any icon lib is fine
import {blockUser, reportUser, unmatch } from '../utils/MatchActions';

export default function MatchOptionsMenu({ matchId, otherUserId }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="p-2 rounded-full hover:bg-white/10"
        onClick={() => setOpen((o) => !o)}
      >
        <FiMoreHorizontal size={24} />
      </button>

      {open && (
        <ul
        className="absolute right-0 mt-2 w-40 backdrop-blur-md rounded-lg shadow-lg bg-white/30 z-[60]"
        onClick={(e) => e.stopPropagation()}
        style={{ pointerEvents: "auto" }} // force it if needed
        >
          {["Block", "Report", "Unmatch"].map((label) => (
            <li
            className="px-4 py-2 text-sm hover:bg-white/40 cursor-pointer"
            onClick={(e) => {
                e.stopPropagation(); // just in case
                handleAction(label);
            }}
            >
            {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  async function handleAction(action) {
    switch (action) {
      case "Block":
        await blockUser(otherUserId);
        break;
      case "Report":
        await reportUser(otherUserId);
        break;
      case "Unmatch":
        await unmatch(matchId);
        break;
      default:
        break;
    }
    setOpen(false);
  }
}
