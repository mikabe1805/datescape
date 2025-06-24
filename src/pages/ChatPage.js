// ChatPage.js
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "../firebase";
import { motion } from "framer-motion";
import { doc, getDoc } from "firebase/firestore";
import {
  FaArrowLeft,
  FaPaperclip,
  FaMicrophone,
  FaRegSmile,
  FaPaperPlane,
} from "react-icons/fa";
import RecordingPopup from "../utils/RecordingPopup";
import EmojiPicker from "emoji-picker-react";
import {useTypingStatus, useListenToTyping} from "../utils/TypingIndicator";

const ChatPage = () => {
  const { matchId } = useParams();
    const currentUserId = auth.currentUser.uid;

    const otherUserId = matchId
  ?.split("_")
  .find((id) => id !== currentUserId);

  const navigate = useNavigate();
  const inputRef = useRef();

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatEndRef = useRef(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const [otherUser, setOtherUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const handleTyping = useTypingStatus(matchId, currentUserId);
  useListenToTyping(matchId, otherUserId, setIsTyping);


useEffect(() => {
  const fetchUser = async () => {
  try {
    const otherUserId = matchId.replace(currentUserId, "").replace(/_/g, "");
    const userDocRef = doc(db, "users", otherUserId);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      setOtherUser(docSnap.data());
    } else {
      console.warn("No such user found!");
    }
  } catch (error) {
    console.error("Error fetching user info:", error);
  }
};

  fetchUser();
}, [otherUserId]);



  useEffect(() => {
  if (!matchId) return;

  const q = query(
    collection(db, "matches", matchId, "messages"),
    orderBy("timestamp", "asc")
  );

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const msgs = [];
    querySnapshot.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() }));
    setMessages(msgs);
  });

  return () => unsubscribe(); // 🧹 clean up on unmount
}, [matchId]);



  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);
  useEffect(() => {
  if (!isScrolledUp && chatEndRef.current) {
    chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }
}, [messages]);


  const sendMessage = async (type = "text", content = message) => {
    if (!content && type === "text") return;
    await addDoc(collection(db, "matches", matchId, "messages"), {
      senderId: auth.currentUser.uid,
      text: type === "text" ? content : null,
      mediaURL: type !== "text" ? content : null,
      type,
      timestamp: serverTimestamp(),
      isRead: false,
    });
    setMessage("");
  };

  const handleEmojiClick = (emojiData) => {
  setMessage((prev) => prev + emojiData.emoji);
};


  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    const fileRef = ref(storage, `chatMedia/${matchId}/${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    await sendMessage("image", url);
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const fileRef = ref(storage, `chatMedia/${matchId}/voice-${Date.now()}.webm`);
      await uploadBytes(fileRef, blob);
      const url = await getDownloadURL(fileRef);
      await sendMessage("audio", url);
    };

    setAudioChunks(chunks);
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
      mediaRecorder.stop();
      setMediaRecorder(null);
    }
    setAudioChunks([]);
    setIsRecording(false);
  };
  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    setIsScrolledUp(scrollTop + clientHeight < scrollHeight - 100);
    };

  const scrollToBottom = () => {
    setIsScrolledUp(false);
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };


  return (
    <main className="pt-4 px-4 min-h-screen relative bg-[#0e1c17] text-[#ffeff0]">

  <div className="flex items-center justify-center relative mb-4">
  <button
    onClick={() => navigate(-1)}
    className="absolute left-0 top-1 text-amber-300 text-xl"
  >
    <FaArrowLeft />
  </button>

  <div className="text-center">
    <h1 className="text-lg font-serif font-semibold text-amber-300">{otherUser?.displayName || "Chat"}</h1>
    {otherUser?.lastSeen && (
      <p className="text-sm text-amber-100 italic">
        Last active: {new Date(otherUser.lastSeen.seconds * 1000).toLocaleString()}
      </p>
    )}
    {isTyping && (
        <p className="text-sm italic text-amber-200 text-center animate-pulse -mt-2">
            {otherUser?.displayName || "They"} is typing…
        </p>
    )}

  </div>

  <div className="absolute right-0 top-0">
    <button onClick={() => setShowDropdown(!showDropdown)} className="text-amber-300">
      ⋮
    </button>
    {showDropdown && (
      <div className="absolute right-0 mt-6 bg-white/10 text-white text-sm rounded-md shadow z-20">
        <button className="block w-full px-4 py-2 hover:bg-white/20">Block</button>
        <button className="block w-full px-4 py-2 hover:bg-white/20">Report</button>
      </div>
    )}
  </div>
</div>


  {/* CHAT MESSAGES */}
  <div
    className="space-y-4 overflow-y-auto pr-2 mb-[100px] max-h-[calc(100vh-150px)]"
    onScroll={handleScroll}
  >
    {messages.map((msg) => (
      <motion.div
        key={msg.id}
        className={`max-w-[75%] px-4 py-2 rounded-2xl shadow text-sm
          ${msg.senderId === auth.currentUser.uid
            ? "bg-pink-200 ml-auto text-black"
            : "bg-white/10 text-white mr-auto"
          }`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 150 }}
      >
        {msg.type === "text" && <p>{msg.text}</p>}
        {msg.type === "image" && (
          <img src={msg.mediaURL} alt="sent" className="rounded-lg max-w-full" />
        )}
        {msg.type === "audio" && (
          <audio controls src={msg.mediaURL} className="w-full" />
        )}
      </motion.div>
    ))}
    <div ref={chatEndRef} />
  </div>

  {/* EMOJI PICKER */}
  {showEmojiPicker && (
    <div className="absolute bottom-28 left-4 z-50">
      <EmojiPicker
        onEmojiClick={handleEmojiClick}
        theme="dark"
        emojiStyle="google"
        height={350}
        width={300}
      />
    </div>
  )}

  {/* CHAT INPUT BAR */}
  <div className="fixed bottom-0 left-0 w-full px-4 pb-4 pt-2 bg-[#0e1c17] border-t border-white/10 z-50">
    <div className="flex items-center gap-3 p-4 min-h-[64px] bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
      <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="text-amber-300">
        <FaRegSmile />
      </button>
      <button onClick={startRecording} className="text-amber-300">
        <FaMicrophone />
      </button>
      <label className="text-amber-300 cursor-pointer">
        <FaPaperclip />
        <input type="file" hidden onChange={handleFileUpload} />
      </label>
      <input
        ref={inputRef}
        type="text"
        placeholder="Type a message..."
        className="flex-grow bg-transparent text-white placeholder-amber-100 focus:outline-none"
        value={message}
        onChange={(e) => {
        setMessage(e.target.value);
        handleTyping();        // ← mark yourself as typing
        }}

        onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
            }
        }}
    />

      <button onClick={() => sendMessage()} className="text-amber-300">
        <FaPaperPlane />
      </button>
    </div>
  </div>

  {/* RECORDING POPUP */}
  <RecordingPopup
    isRecording={isRecording}
    duration={recordingDuration}
    onStop={stopRecording}
    onCancel={cancelRecording}
  />

  {/* SCROLL DOWN ARROW */}
  {isScrolledUp && (
  <button
    onClick={scrollToBottom}
    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 bg-amber-400 text-black p-2 rounded-full shadow-md animate-bounce"
  >
    ↓
  </button>
)}

</main>

  );
};

export default ChatPage;
