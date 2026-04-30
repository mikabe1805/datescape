import { useEffect, useRef, useState } from "react";

const CHAT_MAX_LEN = 80;

// Anchored chat input. Activates when `open` flips true; submits a string and closes.
export default function ChatInput({ open, onSend, onClose }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue("");
      // Defer focus until after the DOM updates.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = value.trim().slice(0, CHAT_MAX_LEN);
    if (text) onSend?.(text);
    onClose?.();
  };

  const handleKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
    }
  };

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, CHAT_MAX_LEN))}
        onKeyDown={handleKey}
        placeholder="Say something…"
        className="chat-input__field"
        autoComplete="off"
        spellCheck="false"
        maxLength={CHAT_MAX_LEN}
      />
      <button type="submit" className="chat-input__send" aria-label="Send">
        ↩
      </button>
    </form>
  );
}
