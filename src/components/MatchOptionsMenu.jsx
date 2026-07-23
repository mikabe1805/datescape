// components/MatchOptionsMenu.jsx
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { blockUser, reportUser, unmatch } from "../utils/MatchActions";

const BLOCK_CONFIRM = "Block this user? You won't see each other in the queue or be able to message again.";
const REPORT_PROMPT = "What's wrong? (optional)";

export default function MatchOptionsMenu({
  matchId,
  otherUserId,
  onAction,
  canUnmatch = true,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative">
      <button
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-amber-100 transition hover:bg-white/14"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
      >
        <MoreHorizontal size={20} />
      </button>

      {open && (
        <ul
          className="absolute right-0 z-[60] mt-2 w-44 overflow-hidden rounded-2xl border border-white/12 bg-[rgba(14,28,23,0.94)] shadow-[0_18px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
          style={{ pointerEvents: "auto" }}
        >
          {(canUnmatch ? ["Block", "Report", "Unmatch"] : ["Block", "Report"]).map((label) => (
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
    if (busy) return;
    try {
      if (action === "Block") {
        if (!window.confirm(BLOCK_CONFIRM)) {
          setOpen(false);
          return;
        }
        setBusy(true);
        await blockUser(otherUserId);
      } else if (action === "Report") {
        const reason = window.prompt(REPORT_PROMPT);
        if (reason === null) {
          setOpen(false);
          return;
        }
        setBusy(true);
        await reportUser(otherUserId, reason || null);
      } else if (action === "Unmatch") {
        if (!window.confirm("Unmatch this user? Any future connection will require fresh consent from both people.")) {
          setOpen(false);
          return;
        }
        setBusy(true);
        await unmatch(matchId);
      }
      onAction?.(action);
    } catch (error) {
      console.error("Match action failed", error);
      alert("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }
}
