const dummyMessages = [
  {
    id: 1,
    sender: "them", // or "me"
    type: "text",
    content: "Hey there 🌸",
    timestamp: "2025-06-23T20:30:00Z",
    read: true,
  },
  {
    id: 2,
    sender: "me",
    type: "text",
    content: "Hi! I love cherry blossoms.",
    timestamp: "2025-06-23T20:32:00Z",
    read: true,
  },
  {
    id: 3,
    sender: "me",
    type: "image",
    content: "/uploads/cherry3.png", // placeholder path
    timestamp: "2025-06-23T20:33:00Z",
    read: true,
  },
  {
    id: 4,
    sender: "them",
    type: "voice",
    content: "/uploads/voice-note.mp3", // placeholder path
    timestamp: "2025-06-23T20:34:00Z",
    read: false,
  },
  {
    id: 5,
    sender: "me",
    type: "text",
    content: "Can you hear me okay?",
    timestamp: "2025-06-23T20:35:00Z",
    read: false,
  },
];

export default dummyMessages;
