import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isNew = !getApps().length;
const app = isNew ? initializeApp(firebaseConfig) : getApps()[0];

// iPhone（Safari）やモバイル回線で通信が止まりにくい設定
// ・通常の接続がうまくいかない環境では、自動で「ロングポーリング」方式に切り替える
// ・undefined を含むデータも、エラーにせず無視して保存する
function createDb() {
  if (!isNew) return getFirestore(app);
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    });
  } catch {
    // すでに初期化済みのとき（画面の再読み込み時など）は、そのまま使う
    return getFirestore(app);
  }
}

export const db = createDb();
