// components/MatchOptionsMenu.jsx
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { blockUser, reportUser, unmatch } from "../utils/MatchActions";

export default function MatchOptionsMenu({ matchId, otherUserId }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-amber-100 transition hover:bg-white/14"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={20} />
      </button>

      {open && (
        <ul
          className="absolute right-0 z-[60] mt-2 w-44 overflow-hidden rounded-2xl border border-white/12 bg-[rgba(14,28,23,0.94)] shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
          style={{ pointerEvents: "auto" }}
        >
          {["Block", "Report", "Unmatch"].map((label) => (
            <li
              key={label}
              className="cursor-pointer px-4 py-3 text-sm text-amber-50 transition hover:bg-white/10"
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
