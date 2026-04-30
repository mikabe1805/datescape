import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  getDoc,
  writeBatch,
  updateDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { motion } from "framer-motion";
import {
  FaArrowLeft,
  FaHeart,
  FaMicrophone,
  FaPaperPlane,
  FaPaperclip,
  FaRegSmile
} from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";
import { auth, db, storage } from "../firebase";
import RecordingPopup from "../utils/RecordingPopup";
import { useListenToTyping, useTypingStatus } from "../utils/TypingIndicator";
import { blockUser, reportUser } from "../utils/MatchActions";

function getMessageLikeCount(messageLikes = {}) {
  return Object.values(messageLikes || {}).filter(Boolean).length;
}

const SCROLL_STORAGE_PREFIX = "datescape:chatScroll:";

export default function ChatPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatStreamRef = useRef(null);
  const hasInitializedScrollRef = useRef(false);
  const lastTapRef = useRef({ id: null, at: 0 });

  const currentUserId = auth.currentUser?.uid;
  const otherUserId = useMemo(
    () => matchId?.split("_").find((id) => id !== currentUserId),
    [currentUserId, matchId]
  );

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [likedBurstMessageId, setLikedBurstMessageId] = useState(null);

  const handleTyping = useTypingStatus(matchId, currentUserId);
  useListenToTyping(matchId, otherUserId, setIsTyping);

  useEffect(() => {
    if (!matchId || !otherUserId) return;

    const fetchUser = async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", otherUserId));
        if (userSnap.exists()) {
          setOtherUser(userSnap.data());
        }
      } catch (error) {
        console.error("Error fetching user info:", error);
      }
    };

    fetchUser();
  }, [matchId, otherUserId]);

  useEffect(() => {
    if (!matchId || !currentUserId) return;

    const messagesQuery = query(
      collection(db, "matches", matchId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
      const nextMessages = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setMessages(nextMessages);

      const unreadIncoming = nextMessages.filter(
        (item) => item.senderId !== currentUserId && item.isRead === false
      );
      if (!unreadIncoming.length) return;

      const batch = writeBatch(db);
      unreadIncoming.forEach((item) => {
        batch.update(doc(db, "matches", matchId, "messages", item.id), { isRead: true });
      });
      batch.commit().catch((error) => {
        console.warn("Failed to mark messages read", error);
      });
    });

    return () => unsubscribe();
  }, [currentUserId, matchId]);

  useEffect(() => {
    let intervalId;
    if (isRecording) {
      intervalId = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }

    return () => clearInterval(intervalId);
  }, [isRecording]);

  // First time messages arrive for this match, jump to bottom (or restore the
  // user's last scroll position if they left off mid-thread). After that, only
  // auto-scroll on new messages when the user is already pinned to the bottom.
  // Crucially: do NOT depend on isScrolledUp here. Letting the effect fire
  // every time the user crosses the bottom threshold caused
  // `scrollIntoView({ behavior: "smooth" })` to ripple through scroll
  // containers and momentarily lift the chat-shell out of place.
  useEffect(() => {
    if (!matchId || !messages.length) return;
    const stream = chatStreamRef.current;
    if (!stream) return;

    if (!hasInitializedScrollRef.current) {
      const stored = sessionStorage.getItem(`${SCROLL_STORAGE_PREFIX}${matchId}`);
      const target = stored !== null ? Number(stored) : stream.scrollHeight;
      requestAnimationFrame(() => {
        stream.scrollTop = Number.isFinite(target) ? target : stream.scrollHeight;
        hasInitializedScrollRef.current = true;
      });
      return;
    }

    // User is "pinned" to the bottom if they're within ~120px of it. In that
    // case, auto-follow new messages with a direct scrollTop write — no
    // scrollIntoView, no smooth animation, no scroll-container chaining.
    const isPinnedToBottom =
      stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 120;
    if (isPinnedToBottom) {
      requestAnimationFrame(() => {
        stream.scrollTop = stream.scrollHeight;
      });
    }
  }, [matchId, messages]);

  // Reset the init flag when switching to a different match.
  useEffect(() => {
    hasInitializedScrollRef.current = false;
  }, [matchId]);

  // Lock document scroll while in the chat. The CSS rule
  // `body.chat-active, body.chat-active .app-route-shell, body.chat-active
  // .main-app-wrapper { overflow: hidden; height: 100dvh }` shuts down every
  // ancestor scroll container — without this, scrolling past the bottom of
  // the message stream in chats with tall media leaks into the document and
  // pushes the fixed chat-shell off the viewport.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("chat-active");
    return () => {
      document.body.classList.remove("chat-active");
    };
  }, []);

  // Persist scroll position so re-entering the chat lands where the user left.
  useEffect(() => {
    if (!matchId) return undefined;
    const stream = chatStreamRef.current;
    if (!stream) return undefined;

    const save = () => {
      try {
        sessionStorage.setItem(
          `${SCROLL_STORAGE_PREFIX}${matchId}`,
          String(stream.scrollTop)
        );
      } catch {}
    };

    stream.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      stream.removeEventListener("scroll", save);
    };
  }, [matchId]);

  const sendMessage = async (type = "text", content = message.trim()) => {
    if (!matchId || !currentUserId) return;
    if (!content && type === "text") return;

    await addDoc(collection(db, "matches", matchId, "messages"), {
      senderId: currentUserId,
      text: type === "text" ? content : null,
      mediaURL: type !== "text" ? content : null,
      type,
      timestamp: serverTimestamp(),
      isRead: false
    });

    setMessage("");
    setShowEmojiPicker(false);
  };

  const toggleMessageLike = async (messageId) => {
    if (!matchId || !currentUserId) return;

    try {
      const target = messages.find((item) => item.id === messageId);
      const alreadyLiked = Boolean(target?.messageLikes?.[currentUserId]);
      const messageRef = doc(db, "matches", matchId, "messages", messageId);

      if (alreadyLiked) {
        await updateDoc(messageRef, { [`messageLikes.${currentUserId}`]: null });
        return;
      }

      await updateDoc(messageRef, { [`messageLikes.${currentUserId}`]: true });
      setLikedBurstMessageId(messageId);
      window.setTimeout(() => {
        setLikedBurstMessageId((current) => (current === messageId ? null : current));
      }, 700);
    } catch (error) {
      console.warn("Failed to like message", error);
    }
  };

  const handleTouchMessage = (messageId) => {
    const now = Date.now();
    if (lastTapRef.current.id === messageId && now - lastTapRef.current.at < 280) {
      toggleMessageLike(messageId);
      lastTapRef.current = { id: null, at: 0 };
      return;
    }

    lastTapRef.current = { id: messageId, at: now };
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !matchId) return;

    const fileRef = ref(storage, `chatMedia/${matchId}/${Date.now()}-${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    const fileType = file.type.startsWith("video")
      ? "video"
      : file.type.startsWith("image")
        ? "image"
        : "file";

    await sendMessage(fileType, url);
    event.target.value = "";
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const fileRef = ref(storage, `chatMedia/${matchId}/voice-${Date.now()}.webm`);
        await uploadBytes(fileRef, blob);
        const url = await getDownloadURL(fileRef);
        await sendMessage("audio", url);
      } finally {
        stream.getTracks().forEach((track) => track.stop());
      }
    };

    setMediaRecorder(recorder);
    recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setMediaRecorder(null);
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorder.stop();
      setMediaRecorder(null);
    }
    setIsRecording(false);
  };

  const handleScroll = (event) => {
    const { scrollTop, clientHeight, scrollHeight } = event.target;
    setIsScrolledUp(scrollTop + clientHeight < scrollHeight - 100);
  };

  const scrollToBottom = () => {
    setIsScrolledUp(false);
    const stream = chatStreamRef.current;
    if (stream) {
      stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
    }
  };

  const otherUserLastActive = otherUser?.lastActive?.seconds
    ? new Date(otherUser.lastActive.seconds * 1000).toLocaleString()
    : null;

  if (!currentUserId) {
    return <div className="chat-loading">Loading chat…</div>;
  }

  const chatPetals = Array.from({ length: 8 }).map((_, index) => {
    const duration = 22 + (index * 1.8);
    const delay = index * 1.7;
    const startX = (index * 13 + 5) % 100;
    const drift = ((index * 7) % 20) - 10;
    return (
      <motion.img
        key={`cp${index}`}
        src="/overlays/petal.png"
        alt=""
        className="chat-petal"
        style={{ left: `${startX}vw` }}
        initial={{ y: -120, x: 0, rotate: 0 }}
        animate={{ y: "115vh", x: `${drift}vw`, rotate: 360 }}
        transition={{ delay, duration, repeat: Infinity, ease: "linear" }}
      />
    );
  });

  return (
    <main className="chat-shell">
      <div className="chat-shell__bg" aria-hidden="true" />
      <div className="chat-shell__veil" aria-hidden="true" />
      <div className="chat-petals" aria-hidden="true">{chatPetals}</div>

      <div className="chat-header">
        <button
          onClick={() => navigate(-1)}
          className="chat-header__back"
          aria-label="Back"
        >
          <FaArrowLeft />
        </button>

        <div className="chat-header__name">
          <h1 className="chat-header__title candle-glow">
            {otherUser?.displayName || "Chat"}
          </h1>
          {isTyping ? (
            <p className="chat-header__sub chat-header__sub--typing">
              {otherUser?.displayName || "They"} are typing…
            </p>
          ) : otherUserLastActive ? (
            <p className="chat-header__sub">Last active {otherUserLastActive}</p>
          ) : null}
        </div>

        <div className="chat-header__menu">
          <button
            onClick={() => setShowDropdown((prev) => !prev)}
            className="chat-header__menu-btn"
            aria-label="More"
          >
            ⋯
          </button>
          {showDropdown && (
            <div className="chat-header__dropdown">
              <button
                className="chat-header__dropdown-item"
                onClick={async () => {
                  setShowDropdown(false);
                  if (!otherUserId) return;
                  if (!window.confirm("Block this user? You won't see each other in the queue or be able to message again.")) return;
                  try {
                    await blockUser(otherUserId);
                    navigate("/app/matches");
                  } catch (error) {
                    console.error("Block failed", error);
                    alert("Couldn't block. Try again in a moment.");
                  }
                }}
              >
                Block
              </button>
              <button
                className="chat-header__dropdown-item"
                onClick={async () => {
                  setShowDropdown(false);
                  if (!otherUserId) return;
                  const reason = window.prompt("What's wrong? (optional)") ?? "";
                  try {
                    await reportUser(otherUserId, reason || null);
                    alert("Report submitted. Our team will review it.");
                  } catch (error) {
                    console.error("Report failed", error);
                    alert("Couldn't submit the report. Try again in a moment.");
                  }
                }}
              >
                Report
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={chatStreamRef}
        className="chat-stream"
        onScroll={handleScroll}
      >
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          const likeCount = getMessageLikeCount(msg.messageLikes);
          return (
            <motion.div
              key={msg.id}
              className={`chat-bubble${isMe ? " chat-bubble--me" : " chat-bubble--them"}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              onDoubleClick={() => toggleMessageLike(msg.id)}
              onTouchEnd={() => handleTouchMessage(msg.id)}
            >
              {likedBurstMessageId === msg.id && (
                <motion.span
                  className="chat-bubble__burst"
                  initial={{ opacity: 0, scale: 0.65, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: -6 }}
                >
                  <FaHeart />
                </motion.span>
              )}

              {msg.type === "text" && <p className="chat-bubble__text">{msg.text}</p>}
              {msg.type === "image" && (
                <img src={msg.mediaURL} alt="sent" className="chat-bubble__media" loading="lazy" />
              )}
              {msg.type === "video" && (
                <video controls className="chat-bubble__media" src={msg.mediaURL} />
              )}
              {msg.type === "audio" && <audio controls src={msg.mediaURL} className="chat-bubble__audio" />}

              <div className="chat-bubble__meta">
                <span>
                  {msg.timestamp?.seconds
                    ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : ""}
                </span>
                {isMe && <span>{msg.isRead ? "Read" : "Sent"}</span>}
              </div>

              {likeCount > 0 && (
                <span className="chat-bubble__like-tag">
                  <FaHeart /> {likeCount}
                </span>
              )}
            </motion.div>
          );
        })}

        <div ref={chatEndRef} />
      </div>

      {showEmojiPicker && (
        <div className="chat-emoji">
          <EmojiPicker
            onEmojiClick={(emojiData) => setMessage((prev) => prev + emojiData.emoji)}
            theme="dark"
            emojiStyle="google"
            height={350}
            width={300}
          />
        </div>
      )}

      <div className="chat-composer">
        <div className="chat-composer__inner">
          <button
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            className="chat-composer__icon"
            aria-label="Emoji"
          >
            <FaRegSmile />
          </button>
          <button onClick={startRecording} className="chat-composer__icon" aria-label="Voice">
            <FaMicrophone />
          </button>
          <label className="chat-composer__icon chat-composer__icon--label" aria-label="Attach">
            <FaPaperclip />
            <input type="file" accept="image/*,video/*" hidden onChange={handleFileUpload} />
          </label>
          <input
            ref={inputRef}
            type="text"
            placeholder="Write something…"
            className="chat-composer__field"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              handleTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />

          <button
            onClick={() => sendMessage()}
            className="chat-composer__send"
            aria-label="Send"
            disabled={!message.trim()}
          >
            <FaPaperPlane />
          </button>
        </div>
      </div>

      <RecordingPopup
        isRecording={isRecording}
        duration={recordingDuration}
        onStop={stopRecording}
        onCancel={cancelRecording}
      />

      {isScrolledUp && (
        <button onClick={scrollToBottom} className="chat-scroll-down" aria-label="Scroll to latest">
          ↓
        </button>
      )}
    </main>
  );
}
