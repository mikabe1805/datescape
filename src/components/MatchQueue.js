import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { Carousel } from 'react-responsive-carousel';
import Slider from 'react-slick';
import MediaCarousel from './MediaCarousel';
import 'slick-carousel/slick/slick.css'; 
import 'slick-carousel/slick/slick-theme.css';
import 'react-responsive-carousel/lib/styles/carousel.min.css';
import '../styles.css';

export default function MatchQueue() {
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      try {
        const userId = auth.currentUser.uid;
        const matchesRef = collection(db, 'matches');
        const matchesQuery = query(
          matchesRef,
          where("participants", "array-contains", userId),
          where("isActive", "==", true)
        );
        const querySnapshot = await getDocs(matchesQuery);

        const matchData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMatches(matchData);
      } catch (error) {
        console.error("Error fetching matches:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, []);

  const displayHeight = () => {
    if (!profile?.selfHeight) return 'Unknown';
    const feet = Math.floor(profile.selfHeight / 12);
    const inches = profile.selfHeight % 12;
    return `${feet}'${inches}"`;
  };

 const handleAction = async (liked) => {
  if (currentIndex >= matches.length) return;
  const match = matches[currentIndex];
  const userId = auth.currentUser.uid;
  const matchDocRef = doc(db, 'matches', match.id);

  const isUserA = match.userA === userId;
  const updateField = isUserA ? 'likedByA' : 'likedByB';

  await updateDoc(matchDocRef, { [updateField]: liked });

  if (!liked) {
    await updateDoc(matchDocRef, { isActive: false });
  } else {
    const bothLiked = (isUserA ? match.likedByB : match.likedByA) === true;

    if (bothLiked) {
      await updateDoc(matchDocRef, { matched: true, isActive: false });
    }
  }

  setCurrentIndex(prev => prev + 1);
};



  if (loading) return <div>Loading...</div>;
  if (currentIndex >= matches.length) return <div>No matches available</div>;

  const match = matches[currentIndex];
  const userId = auth.currentUser.uid;
  const profile = userId === match.userA 
  ? match.userBProfile 
  : match.userAProfile;

  if (!profile) return <div>Loading profile...</div>;

  return (
    <div id="root">
      <div className="fullscreen-background" />
    <div className="main-content">
    
    <div className="match-background">
      <AnimatePresence>
        <motion.div
          className="match-card"
          key={profile.uid}
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
  <h2 style={{ margin: 0, color: '#222' }}>{profile.displayName}, {profile.age}</h2>
  <div style={{ fontSize: '1rem', color: '#666', marginTop: '5px' }}>{profile.zodiacSign}</div>
  <div style={{
    marginTop: '10px',
    padding: '5px 15px',
    background: 'rgba(255, 255, 255, 0.25)',
    borderRadius: '50px',
    color: '#333',
    fontWeight: '500',
    fontSize: '0.9rem'
  }}>{formatLookingFor(profile.lookingFor)}</div>
</div>



          <Carousel
          showThumbs={false}
          infiniteLoop
          emulateTouch
          showStatus={false}
          dynamicHeight={false}  // <-- important!
          autoFocus={false}
          swipeable={true}
          useKeyboardArrows={true}

          className="carousel-wrapper"
        >
          {(profile.media || []).map((url, index) => (
            <div key={index} className="carousel-slide">
              {url.includes('.mp4') ? (
                <video
                  src={url}
                  controls
                  className="carousel-media"
                  preload="metadata"
                />
              ) : (
                <img
                  src={url}
                  alt={`media-${index}`}
                  className="carousel-media"
                />
              )}
            </div>
          ))}
        </Carousel>

          



          <div className="interests-bubbles">
            {(profile.interests || []).map((interest, i) => (
              <span key={i} className="interest-bubble">{interest}</span>
            ))}
          </div>

          <div className="badges-section">
            <span className="demographic-bubble">{profile.races?.join(', ') || 'Unknown'}</span>
            <span className="demographic-bubble">{profile.religions?.join(', ') || 'None'}</span>
            <span className="demographic-bubble">{profile.politics} wing</span>
            <span className="demographic-bubble">{displayHeight()}</span>
          </div>

          <div className="prompts-section">
        {(profile.profilePrompts || []).map((promptObj, index) => (
          <div key={index} className="prompt-card">
            <strong>{promptObj.prompt}</strong>
            <p>{promptObj.answer}</p>
          </div>
        ))}
      </div>

      <div className="match-strength">
            {getMatchLabel(match.matchScore || 0)}
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
  onClick={() => handleAction(false)}
>
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
  onClick={() => handleAction(true)}
>
    💖 Like
  </button>
</div>


        </motion.div>
      </AnimatePresence>
    </div>
    </div>
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

const getMatchLabel = (score) => {
  if (score >= 80) return "woah";
  if (score >= 65) return "Amazing Match 💞";
  if (score >= 30) return "Great Match 🔥";
  if (score >= 0) return "Good Potential ✨";
  return "Might Not Be A Fit 🤔";
};

function arraySafe(val) { return Array.isArray(val) ? val : []; }
