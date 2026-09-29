import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAz4v4B9vP3WzRWSsFXheaLz-9Sfts-fYs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "vibe-workceck.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "vibe-workceck",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "vibe-workceck.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "184048401085",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:184048401085:web:ae47cb993f2626fb2555d4",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0D1VL6T29P"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);

export function loginEmail(loginId) {
  return `${String(loginId).trim().toLowerCase()}@knut.local`;
}

