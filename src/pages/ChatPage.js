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

function getMessageLikeCount(messageLikes = {}) {
  return Object.values(messageLikes || {}).filter(Boolean).length;
}

export default function ChatPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
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

  useEffect(() => {
    if (!isScrolledUp) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isScrolledUp, messages]);

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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const otherUserLastActive = otherUser?.lastActive?.seconds
    ? new Date(otherUser.lastActive.seconds * 1000).toLocaleString()
    : null;

  if (!currentUserId) {
    return <div className="p-6 text-center">Loading chat...</div>;
  }

  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#081511] text-[#ffeff0]">
      <div className="relative flex items-center justify-center border-b border-white/8 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 top-[calc(env(safe-area-inset-top)+0.85rem)] text-xl text-amber-300"
        >
          <FaArrowLeft />
        </button>

        <div className="text-center">
          <h1 className="text-lg font-serif font-semibold text-amber-300">
            {otherUser?.displayName || "Chat"}
          </h1>
          {otherUserLastActive && (
            <p className="text-sm italic text-amber-100">
              Last active: {otherUserLastActive}
            </p>
          )}
          {isTyping && (
            <p className="-mt-2 text-center text-sm italic text-amber-200 animate-pulse">
              {otherUser?.displayName || "They"} are typing...
            </p>
          )}
        </div>

        <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.7rem)]">
          <button onClick={() => setShowDropdown((prev) => !prev)} className="text-amber-300">
            ...
          </button>
          {showDropdown && (
            <div className="absolute right-0 z-20 mt-6 overflow-hidden rounded-2xl border border-white/12 bg-[rgba(14,28,23,0.92)] text-sm text-white shadow-[0_18px_38px_rgba(0,0,0,0.24)] backdrop-blur-xl">
              <button className="block w-full px-4 py-3 text-left hover:bg-white/10">Block</button>
              <button className="block w-full px-4 py-3 text-left hover:bg-white/10">Report</button>
            </div>
          )}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4"
        onScroll={handleScroll}
        style={{ scrollBehavior: "smooth" }}
      >
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            className={`relative max-w-[78%] rounded-[28px] px-4 py-3 text-sm shadow-[0_12px_28px_rgba(0,0,0,0.18)] ${
              msg.senderId === currentUserId
                ? "ml-auto border border-rose-100/65 bg-[rgba(252,213,231,0.96)] text-[#1d1518]"
                : "mr-auto border border-white/8 bg-[rgba(255,255,255,0.12)] text-white backdrop-blur-xl"
            }`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 150 }}
            onDoubleClick={() => toggleMessageLike(msg.id)}
            onTouchEnd={() => handleTouchMessage(msg.id)}
          >
            {likedBurstMessageId === msg.id && (
              <motion.span
                className="pointer-events-none absolute right-3 top-2 text-lg"
                initial={{ opacity: 0, scale: 0.65, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: -6 }}
              >
                <FaHeart className="text-rose-500" />
              </motion.span>
            )}

            {msg.type === "text" && <p>{msg.text}</p>}
            {msg.type === "image" && (
              <img src={msg.mediaURL} alt="sent" className="max-w-full rounded-[20px]" loading="lazy" />
            )}
            {msg.type === "video" && (
              <video controls className="max-w-full rounded-[20px]" src={msg.mediaURL} />
            )}
            {msg.type === "audio" && <audio controls src={msg.mediaURL} className="w-full" />}

            <div className="mt-2 flex items-center gap-2 text-[11px] opacity-80">
              <span>
                {msg.timestamp?.seconds
                  ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })
                  : ""}
              </span>
              {msg.senderId === currentUserId && <span>{msg.isRead ? "Read" : "Sent"}</span>}
            </div>

            {getMessageLikeCount(msg.messageLikes) > 0 && (
              <div className="mt-2 flex items-center gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-1 text-[11px] text-current">
                  <FaHeart className="text-[10px]" /> {getMessageLikeCount(msg.messageLikes)}
                </span>
              </div>
            )}
          </motion.div>
        ))}

        <div ref={chatEndRef} />
      </div>

      {showEmojiPicker && (
        <div className="absolute bottom-28 left-4 z-50">
          <EmojiPicker
            onEmojiClick={(emojiData) => setMessage((prev) => prev + emojiData.emoji)}
            theme="dark"
            emojiStyle="google"
            height={350}
            width={300}
          />
        </div>
      )}

      <div className="border-t border-white/8 bg-[rgba(8,21,17,0.94)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur-2xl">
        <div className="chat-input-container flex min-h-[68px] items-center gap-3 rounded-[28px] border border-white/12 bg-[rgba(255,255,255,0.1)] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <button onClick={() => setShowEmojiPicker((prev) => !prev)} className="text-amber-300">
            <FaRegSmile />
          </button>
          <button onClick={startRecording} className="text-amber-300">
            <FaMicrophone />
          </button>
          <label className="cursor-pointer text-amber-300">
            <FaPaperclip />
            <input type="file" accept="image/*,video/*" hidden onChange={handleFileUpload} />
          </label>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a message..."
            className="flex-grow rounded-full border border-white/16 bg-white/8 px-3 py-2 text-white placeholder-amber-100/85 focus:border-amber-200/32 focus:bg-white/12 focus:outline-none"
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

          <button onClick={() => sendMessage()} className="text-amber-300">
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
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-amber-400 p-2 text-black shadow-md animate-bounce"
        >
          ↓
        </button>
      )}
    </main>
  );
}
