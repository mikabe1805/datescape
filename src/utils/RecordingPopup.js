// This assumes you're already using useState and framer-motion
import { motion, AnimatePresence } from 'framer-motion';

const RecordingPopup = ({ isRecording, onStop, onCancel, duration }) => {
  return (
    <AnimatePresence>
      {isRecording && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 p-6 rounded-3xl 
                     bg-white/10 backdrop-blur-lg shadow-lg border border-white/20 text-white"
        >
          <p className="text-lg font-semibold text-center mb-3 text-pink-200">
            Recording...
          </p>
          <p className="text-center text-sm text-amber-200 mb-4">
            Duration: {duration}s
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={onStop}
              className="px-4 py-2 rounded-lg bg-rose-500 text-white font-bold hover:bg-rose-600 transition"
            >
              Stop
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-gray-500 text-white font-bold hover:bg-gray-600 transition"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RecordingPopup;
