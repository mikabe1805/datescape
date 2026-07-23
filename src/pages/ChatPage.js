import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  doc,
  writeBatch,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { motion } from "framer-motion";
import {
  FaArrowLeft,
  FaArrowDown,
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
import { otherProfileFromMatch } from "../utils/MatchProfiles";

function getMessageLikeCount(messageLikes = {}) {
  return Object.values(messageLikes || {}).filter(Boolean).length;
}

const SCROLL_STORAGE_PREFIX = "datescape:chatScroll:";
export const CHAT_PAGE_SIZE = 50;
export const CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_AUDIO_MAX_BYTES = 10 * 1024 * 1024;

const CHAT_ATTACHMENT_TYPES = Object.freeze({
  "image/jpeg": { kind: "image", maximumBytes: CHAT_IMAGE_MAX_BYTES },
  "image/png": { kind: "image", maximumBytes: CHAT_IMAGE_MAX_BYTES },
  "image/webp": { kind: "image", maximumBytes: CHAT_IMAGE_MAX_BYTES },
  "image/gif": { kind: "image", maximumBytes: CHAT_IMAGE_MAX_BYTES },
  "video/mp4": { kind: "video", maximumBytes: CHAT_VIDEO_MAX_BYTES },
  "video/webm": { kind: "video", maximumBytes: CHAT_VIDEO_MAX_BYTES },
  "video/quicktime": { kind: "video", maximumBytes: CHAT_VIDEO_MAX_BYTES },
});

export function validateChatAttachment(file) {
  const type = typeof file?.type === "string" ? file.type.toLowerCase() : "";
  const configuration = CHAT_ATTACHMENT_TYPES[type];
  if (!configuration) return { ok: false, reason: "type" };
  const size = Number(file?.size);
  if (!Number.isFinite(size) || size <= 0 || size > configuration.maximumBytes) {
    return { ok: false, reason: "size", ...configuration };
  }
  return { ok: true, ...configuration, contentType: type };
}

export async function markIncomingMessagesRead(matchId, unreadMessages) {
  if (!matchId || !unreadMessages.length) return;
  const batch = writeBatch(db);
  unreadMessages.forEach((item) => {
    batch.update(
      doc(db, "matches", matchId, "messages", item.id),
      { isRead: true },
    );
  });
  try {
    await batch.commit();
  } catch (batchError) {
    // A second device can win one false→true transition and make the atomic
    // batch stale. Retry independently so one already-read message does not
    // prevent every other legitimate recipient receipt from being recorded.
    const results = await Promise.allSettled(
      unreadMessages.map((item) =>
        updateDoc(doc(db, "matches", matchId, "messages", item.id), {
          isRead: true,
        }),
      ),
    );
    if (results.every(({ status }) => status === "rejected")) throw batchError;
  }
}

function chatMessageTime(message) {
  const timestamp = message?.timestamp;
  if (typeof timestamp?.toMillis === "function") return timestamp.toMillis();
  if (Number.isFinite(timestamp?.seconds)) {
    return timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function mergeChatMessages(...pages) {
  const byId = new Map();
  pages.flat().forEach((message) => {
    if (!message?.id) return;
    byId.set(message.id, message);
  });
  return [...byId.values()].sort((first, second) => {
    const timeDelta = chatMessageTime(first) - chatMessageTime(second);
    return timeDelta || String(first.id).localeCompare(String(second.id));
  });
}

export function scrollTopAfterPrepend(
  previousScrollTop,
  previousScrollHeight,
  nextScrollHeight,
) {
  const safeTop = Number.isFinite(previousScrollTop) ? previousScrollTop : 0;
  if (
    !Number.isFinite(previousScrollHeight) ||
    !Number.isFinite(nextScrollHeight)
  ) {
    return safeTop;
  }
  return safeTop + Math.max(0, nextScrollHeight - previousScrollHeight);
}

export function resolveChatConnection(matchData, currentUserId) {
  if (!matchData || !currentUserId) {
    return { state: "invalid", otherUserId: null };
  }

  const participantSource = Array.isArray(matchData.participants)
    ? matchData.participants
    : [matchData.userA, matchData.userB];
  const participants = [...new Set(participantSource.filter(Boolean))];
  if (participants.length !== 2 || !participants.includes(currentUserId)) {
    return { state: "invalid", otherUserId: null };
  }

  const otherUserId = participants.find((uid) => uid !== currentUserId) || null;
  // isActiveA/isActiveB belong to the discovery-card lifecycle and are false
  // after a mutual connection is created. The canonical chat gate is the
  // match's mutual state itself; unmatch/block teardown sets `matched` false.
  const ended = matchData.matched !== true;

  return {
    state: ended ? "ended" : "active",
    otherUserId,
  };
}

export default function ChatPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatStreamRef = useRef(null);
  const hasInitializedScrollRef = useRef(false);
  const lastTapRef = useRef({ id: null, at: 0 });
  const cancelledRecordersRef = useRef(new WeakSet());
  const connectionActiveRef = useRef(false);
  const sendingRef = useRef(false);
  const oldestCursorRef = useRef(null);
  const hasLoadedEarlierRef = useRef(false);
  const loadingEarlierRef = useRef(false);
  const historyGenerationRef = useRef(0);
  const liveMessagesRef = useRef([]);
  const pendingPrependScrollRef = useRef(null);

  const currentUserId = auth.currentUser?.uid;

  const [message, setMessage] = useState("");
  const [liveMessages, setLiveMessages] = useState([]);
  const [earlierMessages, setEarlierMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [likedBurstMessageId, setLikedBurstMessageId] = useState(null);
  const [connectionState, setConnectionState] = useState("loading");
  const [connectionIssue, setConnectionIssue] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [otherUserId, setOtherUserId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [paginationError, setPaginationError] = useState(null);

  const messages = useMemo(
    () => mergeChatMessages(earlierMessages, liveMessages),
    [earlierMessages, liveMessages],
  );

  const isConnectionActive = connectionState === "active";
  const canReadHistory =
    connectionState === "active" || connectionState === "ended";
  const composerBusy = isSending || isUploading;
  connectionActiveRef.current = isConnectionActive;

  const typingMatchId = isConnectionActive ? matchId : null;
  const typingOtherUserId = isConnectionActive ? otherUserId : null;
  const handleTyping = useTypingStatus(typingMatchId, currentUserId);
  useListenToTyping(typingMatchId, typingOtherUserId, setIsTyping);

  useEffect(() => {
    setConnectionState("loading");
    setConnectionIssue(null);
    setHistoryError(null);
    setOtherUserId(null);
    setOtherUser(null);
    setLiveMessages([]);
    liveMessagesRef.current = [];
    setEarlierMessages([]);
    setMessage("");
    setActionError(null);
    setShowEmojiPicker(false);
    setHasEarlierMessages(false);
    setIsLoadingEarlier(false);
    setPaginationError(null);
    oldestCursorRef.current = null;
    hasLoadedEarlierRef.current = false;
    loadingEarlierRef.current = false;
    historyGenerationRef.current += 1;
    pendingPrependScrollRef.current = null;

    if (!matchId || !currentUserId) {
      setConnectionState("invalid");
      setConnectionIssue(
        "This conversation is unavailable. Return to Connections to choose an active chat.",
      );
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, "matches", matchId),
      (matchSnapshot) => {
        if (!matchSnapshot.exists()) {
          setConnectionState("invalid");
          setOtherUserId(null);
          setConnectionIssue(
            "This conversation is no longer available. Any history still on this screen is read-only.",
          );
          return;
        }

        const matchData = matchSnapshot.data();
        const resolved = resolveChatConnection(matchData, currentUserId);
        setConnectionState(resolved.state);
        setOtherUserId(resolved.otherUserId);
        setOtherUser(otherProfileFromMatch(matchData, currentUserId));
        setConnectionIssue(
          resolved.state === "ended"
            ? "This connection has ended. Your conversation remains here as read-only history."
            : resolved.state === "invalid"
              ? "This conversation is unavailable. Any history still on this screen is read-only."
              : null,
        );
        if (resolved.state !== "active") {
          setShowEmojiPicker(false);
          setActionError(null);
        }
      },
      (error) => {
        console.warn("Failed to verify chat connection", error);
        setConnectionState("invalid");
        setOtherUserId(null);
        setOtherUser(null);
        setConnectionIssue(
          "This conversation could not be verified. Any history still on this screen is read-only.",
        );
        setShowEmojiPicker(false);
      },
    );

    return () => {
      historyGenerationRef.current += 1;
      loadingEarlierRef.current = false;
      unsubscribe();
    };
  }, [currentUserId, matchId]);

  useEffect(() => {
    if (!matchId || !currentUserId || !canReadHistory) return undefined;

    setHistoryError(null);

    const messagesQuery = query(
      collection(db, "matches", matchId, "messages"),
      orderBy("timestamp", "desc"),
      limit(CHAT_PAGE_SIZE),
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (querySnapshot) => {
        const pageDocs = querySnapshot.docs;
        const nextMessages = pageDocs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        if (hasLoadedEarlierRef.current) {
          const nextIds = new Set(nextMessages.map((item) => item.id));
          const evictedMessages = liveMessagesRef.current.filter(
            (item) => !nextIds.has(item.id),
          );
          if (evictedMessages.length) {
            setEarlierMessages((current) =>
              mergeChatMessages(current, evictedMessages),
            );
          }
        } else {
          const oldestDocument = pageDocs[pageDocs.length - 1] || null;
          oldestCursorRef.current = oldestDocument;
          setHasEarlierMessages(pageDocs.length === CHAT_PAGE_SIZE);
        }
        liveMessagesRef.current = nextMessages;
        setLiveMessages(nextMessages);
        setHistoryError(null);

        if (!isConnectionActive) return;
        const unreadIncoming = nextMessages.filter(
          (item) => item.senderId !== currentUserId && item.isRead === false
        );
        if (!unreadIncoming.length) return;

        markIncomingMessagesRead(matchId, unreadIncoming).catch((error) => {
          console.warn("Failed to mark messages read", error);
        });
      },
      (error) => {
        console.warn("Failed to load conversation history", error);
        setHistoryError(
          "Conversation history could not be loaded. Check your connection and try again.",
        );
      },
    );

    return () => unsubscribe();
  }, [canReadHistory, currentUserId, isConnectionActive, matchId]);

  const loadEarlierMessages = async () => {
    if (
      !matchId ||
      !currentUserId ||
      !canReadHistory ||
      !oldestCursorRef.current ||
      loadingEarlierRef.current
    ) {
      return;
    }

    const requestGeneration = historyGenerationRef.current;
    const cursor = oldestCursorRef.current;
    loadingEarlierRef.current = true;
    hasLoadedEarlierRef.current = true;
    setIsLoadingEarlier(true);
    setPaginationError(null);

    try {
      const olderQuery = query(
        collection(db, "matches", matchId, "messages"),
        orderBy("timestamp", "desc"),
        startAfter(cursor),
        limit(CHAT_PAGE_SIZE),
      );
      const olderSnapshot = await getDocs(olderQuery);
      if (historyGenerationRef.current !== requestGeneration) return;

      const pageDocs = olderSnapshot.docs;
      const olderMessages = pageDocs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      const streamBeforePrepend = chatStreamRef.current;
      pendingPrependScrollRef.current = streamBeforePrepend
        ? {
            generation: requestGeneration,
            scrollTop: streamBeforePrepend.scrollTop,
            scrollHeight: streamBeforePrepend.scrollHeight,
          }
        : null;
      setEarlierMessages((current) =>
        mergeChatMessages(current, olderMessages),
      );
      if (connectionActiveRef.current) {
        const unreadIncoming = olderMessages.filter(
          (item) => item.senderId !== currentUserId && item.isRead === false,
        );
        if (unreadIncoming.length) {
          markIncomingMessagesRead(matchId, unreadIncoming).catch((error) => {
            console.warn("Failed to mark earlier messages read", error);
          });
        }
      }
      if (pageDocs.length) {
        oldestCursorRef.current = pageDocs[pageDocs.length - 1];
      }
      setHasEarlierMessages(pageDocs.length === CHAT_PAGE_SIZE);
    } catch (error) {
      if (historyGenerationRef.current !== requestGeneration) return;
      console.warn("Failed to load earlier chat messages", error);
      setPaginationError(
        "Earlier messages could not be loaded. Check your connection and try again.",
      );
    } finally {
      if (historyGenerationRef.current === requestGeneration) {
        loadingEarlierRef.current = false;
        setIsLoadingEarlier(false);
      }
    }
  };

  useLayoutEffect(() => {
    const pending = pendingPrependScrollRef.current;
    if (!pending) return;
    pendingPrependScrollRef.current = null;
    if (pending.generation !== historyGenerationRef.current) return;

    const stream = chatStreamRef.current;
    if (!stream) return;
    const previousInlineScrollBehavior = stream.style.scrollBehavior;
    // The stream normally uses smooth scrolling for explicit navigation. A
    // prepend correction must be synchronous and invisible to the reader.
    stream.style.scrollBehavior = "auto";
    stream.scrollTop = scrollTopAfterPrepend(
      pending.scrollTop,
      pending.scrollHeight,
      stream.scrollHeight,
    );
    stream.style.scrollBehavior = previousInlineScrollBehavior;
  }, [earlierMessages]);

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
    if (isConnectionActive || !mediaRecorder) return;

    cancelledRecordersRef.current.add(mediaRecorder);
    if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    mediaRecorder.stream?.getTracks().forEach((track) => track.stop());
    setMediaRecorder(null);
    setIsRecording(false);
  }, [isConnectionActive, mediaRecorder]);

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

  const sendMessage = async (
    type = "text",
    content = message.trim(),
    preparedMessageRef = null,
  ) => {
    if (!matchId || !currentUserId) return false;
    if (!content && type === "text") return false;
    if (!connectionActiveRef.current) {
      setActionError("This conversation is read-only, so no new messages can be sent.");
      return false;
    }
    if (sendingRef.current) return false;

    sendingRef.current = true;
    setIsSending(true);
    setActionError(null);
    try {
      const messageRef =
        preparedMessageRef || doc(collection(db, "matches", matchId, "messages"));
      await setDoc(messageRef, {
        senderId: currentUserId,
        text: type === "text" ? content : null,
        mediaURL: type !== "text" ? content : null,
        type,
        timestamp: serverTimestamp(),
        isRead: false
      });

      if (type === "text") setMessage("");
      setShowEmojiPicker(false);
      return true;
    } catch (error) {
      console.warn("Failed to send chat message", error);
      const failureCopy =
        type === "audio"
          ? "Your voice message could not be sent. Check your connection and try again."
          : type === "text"
            ? "Your message could not be sent. Check your connection and try again."
            : "Your attachment could not be sent. Check your connection and try again.";
      setActionError(failureCopy);
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const toggleMessageLike = async (messageId) => {
    if (!matchId || !currentUserId || !connectionActiveRef.current) return;

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
      setActionError("That reaction could not be saved. Please try again.");
    }
  };

  const handleTouchMessage = (messageId) => {
    if (!connectionActiveRef.current) return;
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
    if (!connectionActiveRef.current) {
      setActionError("This conversation is read-only, so attachments are unavailable.");
      event.target.value = "";
      return;
    }

    const validation = validateChatAttachment(file);
    if (!validation.ok) {
      setActionError(
        validation.reason === "type"
          ? "Choose a JPEG, PNG, WebP, GIF, MP4, WebM, or QuickTime attachment."
          : validation.kind === "image"
            ? "Images must be 15 MB or smaller."
            : "Videos must be 50 MB or smaller.",
      );
      event.target.value = "";
      return;
    }

    setActionError(null);
    setIsUploading(true);
    const messageRef = doc(collection(db, "matches", matchId, "messages"));
    let fileRef = null;
    let messageCreated = false;
    try {
      const safeName = (file.name || "attachment")
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(-120);
      fileRef = ref(
        storage,
        `chatMedia/${matchId}/${currentUserId}/${messageRef.id}/${Date.now()}-${safeName}`,
      );
      await uploadBytes(fileRef, file, {
        contentType: validation.contentType,
      });
      const url = await getDownloadURL(fileRef);
      messageCreated = await sendMessage(validation.kind, url, messageRef);
      if (!messageCreated) {
        await deleteObject(fileRef).catch((cleanupError) => {
          console.warn("Failed to clean up an unsent chat attachment", cleanupError);
        });
      }
    } catch (error) {
      console.warn("Failed to upload chat attachment", error);
      if (fileRef && !messageCreated) {
        await deleteObject(fileRef).catch((cleanupError) => {
          console.warn("Failed to clean up an unsent chat attachment", cleanupError);
        });
      }
      setActionError(
        "Your attachment could not be uploaded. Check your connection and try again.",
      );
    } finally {
      event.target.value = "";
      setIsUploading(false);
    }
  };

  const startRecording = async () => {
    if (!connectionActiveRef.current || composerBusy) return;

    setActionError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!connectionActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setActionError("This conversation became read-only before recording started.");
        return;
      }

      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onerror = () => {
        cancelledRecordersRef.current.add(recorder);
        setMediaRecorder(null);
        setIsRecording(false);
        setActionError(
          "Voice recording stopped unexpectedly. Check microphone permission and try again.",
        );
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = async () => {
        let voiceFileRef = null;
        let voiceMessageCreated = false;
        try {
          if (cancelledRecordersRef.current.has(recorder)) return;

          setIsUploading(true);
          const blob = new Blob(chunks, { type: "audio/webm" });
          if (blob.size <= 0 || blob.size > CHAT_AUDIO_MAX_BYTES) {
            setActionError(
              blob.size <= 0
                ? "That voice recording was empty. Please try again."
                : "Voice messages must be 10 MB or smaller.",
            );
            return;
          }
          const messageRef = doc(collection(db, "matches", matchId, "messages"));
          voiceFileRef = ref(
            storage,
            `chatMedia/${matchId}/${currentUserId}/${messageRef.id}/voice-${Date.now()}.webm`,
          );
          await uploadBytes(voiceFileRef, blob, { contentType: "audio/webm" });
          const url = await getDownloadURL(voiceFileRef);
          voiceMessageCreated = await sendMessage("audio", url, messageRef);
          if (!voiceMessageCreated) {
            await deleteObject(voiceFileRef).catch((cleanupError) => {
              console.warn("Failed to clean up an unsent voice message", cleanupError);
            });
          }
        } catch (error) {
          console.warn("Failed to upload voice message", error);
          if (voiceFileRef && !voiceMessageCreated) {
            await deleteObject(voiceFileRef).catch((cleanupError) => {
              console.warn("Failed to clean up an unsent voice message", cleanupError);
            });
          }
          setActionError(
            "Your voice message could not be uploaded. Check your connection and try again.",
          );
        } finally {
          setIsUploading(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.warn("Failed to start voice recording", error);
      stream?.getTracks().forEach((track) => track.stop());
      setMediaRecorder(null);
      setIsRecording(false);
      setActionError(
        "Voice recording could not start. Check microphone permission and try again.",
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      try {
        mediaRecorder.stop();
      } catch (error) {
        console.warn("Failed to stop voice recording", error);
        cancelledRecordersRef.current.add(mediaRecorder);
        mediaRecorder.stream?.getTracks().forEach((track) => track.stop());
        setActionError(
          "Voice recording could not be finished. Please try recording again.",
        );
      }
      setMediaRecorder(null);
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      cancelledRecordersRef.current.add(mediaRecorder);
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      mediaRecorder.stream?.getTracks().forEach((track) => track.stop());
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
          {isConnectionActive && isTyping ? (
            <p className="chat-header__sub chat-header__sub--typing">
              {otherUser?.displayName || "They"} are typing…
            </p>
          ) : isConnectionActive && otherUserLastActive ? (
            <p className="chat-header__sub">Last active {otherUserLastActive}</p>
          ) : connectionState === "loading" ? (
            <p className="chat-header__sub">Checking connection…</p>
          ) : !isConnectionActive ? (
            <p className="chat-header__sub">Read-only history</p>
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
                  const reason = window.prompt("What's wrong? (optional)");
                  if (reason === null) return;
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
        id="chat-message-history"
        role="region"
        aria-label="Conversation history"
        ref={chatStreamRef}
        className="chat-stream"
        onScroll={handleScroll}
      >
        {connectionState !== "active" && connectionState !== "loading" && (
          <section className="chat-history-notice" aria-live="polite">
            <strong>
              {connectionState === "ended"
                ? "This connection has ended"
                : "Conversation unavailable"}
            </strong>
            <p>{connectionIssue}</p>
            <button type="button" onClick={() => navigate("/app/matches")}>
              Back to Connections
            </button>
          </section>
        )}

        {hasEarlierMessages && canReadHistory && (
          <div className="chat-history-pagination">
            <button
              type="button"
              onClick={loadEarlierMessages}
              disabled={isLoadingEarlier}
              aria-controls="chat-message-history"
            >
              {isLoadingEarlier
                ? "Loading earlier messages…"
                : "Load earlier messages"}
            </button>
          </div>
        )}

        {paginationError && (
          <p className="chat-history-error" role="alert">
            {paginationError}
          </p>
        )}

        {historyError && (
          <p className="chat-history-error" role="alert">
            {historyError}
          </p>
        )}

        {!messages.length &&
          (connectionState === "ended" || connectionState === "invalid") && (
            <p className="chat-history-empty">No message history is available.</p>
          )}

        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          const likeCount = getMessageLikeCount(msg.messageLikes);
          return (
            <motion.div
              key={msg.id}
              role="article"
              className={`chat-bubble${isMe ? " chat-bubble--me" : " chat-bubble--them"}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
              onDoubleClick={
                isConnectionActive ? () => toggleMessageLike(msg.id) : undefined
              }
              onTouchEnd={
                isConnectionActive ? () => handleTouchMessage(msg.id) : undefined
              }
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

      {showEmojiPicker && isConnectionActive && (
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
        {actionError && (
          <p className="chat-composer__error" role="alert">
            {actionError}
          </p>
        )}
        {!isConnectionActive && connectionState !== "loading" && (
          <p className="chat-composer__status">
            Conversation history · new messages are unavailable
          </p>
        )}
        <div
          className={`chat-composer__inner${
            isConnectionActive ? "" : " chat-composer__inner--readonly"
          }`}
        >
          <button
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            className="chat-composer__icon"
            aria-label="Emoji"
            disabled={!isConnectionActive || composerBusy}
          >
            <FaRegSmile />
          </button>
          <button
            onClick={startRecording}
            className="chat-composer__icon"
            aria-label="Voice"
            disabled={!isConnectionActive || composerBusy}
          >
            <FaMicrophone />
          </button>
          <label
            className="chat-composer__icon chat-composer__icon--label"
            aria-label="Attach"
            aria-disabled={!isConnectionActive || composerBusy}
          >
            <FaPaperclip />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              aria-label="Attach media"
              hidden
              onChange={handleFileUpload}
              disabled={!isConnectionActive || composerBusy}
            />
          </label>
          <input
            ref={inputRef}
            type="text"
            placeholder={
              isConnectionActive
                ? "Write something…"
                : connectionState === "loading"
                  ? "Checking connection…"
                  : "Conversation history is read-only"
            }
            className="chat-composer__field"
            value={message}
            disabled={!isConnectionActive}
            onChange={(event) => {
              setMessage(event.target.value);
              setActionError(null);
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
            disabled={!isConnectionActive || composerBusy || !message.trim()}
          >
            <FaPaperPlane />
          </button>
        </div>
      </div>

      <RecordingPopup
        isRecording={isRecording && isConnectionActive}
        duration={recordingDuration}
        onStop={stopRecording}
        onCancel={cancelRecording}
      />

      {isScrolledUp && (
        <button onClick={scrollToBottom} className="chat-scroll-down" aria-label="Scroll to latest">
          <FaArrowDown aria-hidden="true" />
        </button>
      )}
    </main>
  );
}
