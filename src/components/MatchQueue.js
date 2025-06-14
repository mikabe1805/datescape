import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { Carousel } from 'react-responsive-carousel';
import 'react-responsive-carousel/lib/styles/carousel.min.css';
import '../styles.css';

export default function MatchQueue() {
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    const fetchMatches = async () => {
      if (!user) return;

      const matchesRef = collection(db, 'matches');
      const q = query(matchesRef, 
        where("matched", "==", false), 
        where("userA", "==", user.uid)
      );

      const snapshot = await getDocs(q);
      const matchList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMatches(matchList);
      setLoading(false);
    };

    fetchMatches();
  }, [user]);

  const handleLike = async () => {
    const match = matches[currentIndex];
    await updateMatch(match, "like");
    nextMatch();
  };

  const handlePass = async () => {
    const match = matches[currentIndex];
    await updateMatch(match, "pass");
    nextMatch();
  };

  const updateMatch = async (match, action) => {
    const matchRef = doc(db, "matches", match.id);
    const currentUserId = user.uid;
    let updateData = {};

    if (match.userA === currentUserId) {
      updateData.likedByA = (action === "like");
    } else {
      updateData.likedByB = (action === "like");
    }

    // Check if both users have liked after updating
    const newLikedByA = (match.userA === currentUserId) ? (action === "like") : match.likedByA;
    const newLikedByB = (match.userB === currentUserId) ? (action === "like") : match.likedByB;

    if (newLikedByA && newLikedByB) {
      updateData.matched = true;
    }

    await updateDoc(matchRef, updateData);
  };

  const nextMatch = () => {
    setCurrentIndex(prev => prev + 1);
  };

  if (loading) return <h2>Loading...</h2>;
  if (currentIndex >= matches.length) return <h2>No more matches right now.</h2>;

  const person = matches[currentIndex];
  const media = person.media || [];

  const name = person.displayName || "Unnamed";
  const age = person.age;
  const zodiac = person.zodiacSign || "Unknown";
  const lookingFor = formatLookingFor(person.lookingFor);
  const religions = arraySafe(person.religions).join(", ") || "None";
  const races = arraySafe(person.races).join(", ") || "Unknown";
  const political = person.politics || "Unspecified";
  const interests = arraySafe(person.interests).length ? arraySafe(person.interests) : ["No interests provided"];
  const prompts = person.profilePrompts || {};

  return (
    <div className="match-background">
      <AnimatePresence>
        <motion.div
          className="match-card"
          key={person.uid}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.5 }}
        >
          <div style={{
  background: 'rgba(255, 255, 255, 0.3)',
  backdropFilter: 'blur(14px)',
  borderRadius: '20px',
  padding: '20px 30px',
  marginBottom: '20px',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.1)',  // soft inner glow instead of outer shadow
  textAlign: 'center',
  transition: 'all 0.3s ease'
}}>
  <h2 style={{ margin: 0, color: '#222' }}>{name}, {age}</h2>
  <div style={{ fontSize: '1rem', color: '#666', marginTop: '5px' }}>{zodiac}</div>
  <div style={{
    marginTop: '10px',
    padding: '5px 15px',
    background: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '50px',
    color: '#333',
    fontWeight: '500',
    fontSize: '0.9rem'
  }}>{lookingFor}</div>
</div>



          <Carousel showThumbs={false} infiniteLoop emulateTouch className="carousel-wrapper">
            {media.map((url, index) => {
              return url.includes(".mp4") ? (
                <video key={index} src={url} controls className="carousel-media" />
              ) : (
                <img key={index} src={url} alt={`media-${index}`} className="carousel-media" />
              );
            })}
          </Carousel>

          <div className="interests-bubbles">
            {interests.map((interest, i) => (
              <span key={i} className="interest-bubble">{interest}</span>
            ))}
          </div>

          <div className="badges-section">
            <span className="badge">{races}</span>
            <span className="badge">{religions}</span>
            <span className="badge">{political} wing</span>
          </div>

          <div className="prompts-section">
            {Object.values(prompts).map((promptObj, i) => (
              <div key={i} className="prompt-card">
                <b>{promptObj.prompt}</b>
                <p>{promptObj.answer}</p>
              </div>
            ))}
          </div>


          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
  <button style={{
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '15px 40px',
    borderRadius: '50px',
    color: '#222',
    fontWeight: '600',
    fontSize: '1.1rem',
    boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.15)',
    transition: 'transform 0.2s ease'
  }}
  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.03)'}
  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
  onClick={handlePass}>
    ❌ Pass
  </button>

  <button style={{
    background: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '15px 40px',
    borderRadius: '50px',
    color: '#222',
    fontWeight: '600',
    fontSize: '1.1rem',
    boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.15)',
    transition: 'transform 0.2s ease'
  }}
  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.03)'}
  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
  onClick={handleLike}>
    💖 Like
  </button>
</div>


        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Utility functions (same as before)
function calculateAge(birthdate) {
  if (!birthdate) return "Unknown";
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatLookingFor(val) {
  if (val === "Friendship") return "Friendship";
  if (val === "Dating") return "Dating";
  if (val === "Both") return "Friendship & Dating";
  return "Unknown";
}

function arraySafe(val) { return Array.isArray(val) ? val : []; }
