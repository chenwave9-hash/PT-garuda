/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, Component, ReactNode, useRef } from 'react';
import { 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { Turnstile } from '@marsidev/react-turnstile';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  addDoc, 
  Timestamp, 
  increment,
  getDocs,
  orderBy,
  limit,
  writeBatch
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { 
  Home,
  Briefcase,
  Gift,
  History as HistoryIcon,
  User,
  Phone,
  Mail,
  Lock,
  UserPlus,
  Share2,
  Copy,
  ExternalLink,
  ChevronRight,
  LayoutDashboard, 
  TrendingUp, 
  Wallet, 
  ShieldCheck, 
  LogOut, 
  LogIn, 
  BarChart3,
  PieChart,
  Activity,
  ArrowUpCircle, 
  ArrowDownCircle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  User as UserIcon,
  Settings,
  Menu,
  X,
  ChevronDown,
  MessageSquare,
  HelpCircle,
  Send,
  Plus,
  Minus,
  Ban
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

// --- Types ---
interface UserData {
  uid: string;
  email: string;
  displayName: string;
  balance: number;
  role: 'user' | 'admin';
  isBlocked: boolean;
  photoURL: string;
  vipLevel?: number;
  phoneNumber?: string;
  referralCode: string;
  referredBy?: string;
  hasSeenReferralModal: boolean;
  createdAt: Timestamp;
}

interface Investment {
  id: string;
  uid: string;
  planName: string;
  amount: number;
  profitPct?: number;
  dailyProfit: number;
  daysLeft: number;
  totalDays: number;
  status: 'active' | 'completed';
  lastProfitUpdate: Timestamp;
}

interface Transaction {
  id: string;
  uid: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  fee?: number;
  netAmount?: number;
  status: 'pending' | 'approved' | 'rejected';
  method: string;
  accountName?: string;
  accountNumber?: string;
  proofURL?: string;
  createdAt: Timestamp;
}

// --- Context ---
interface AuthContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  isAuthenticating: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, pass: string, name: string, phone: string, refCode?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserData(docSnap.data() as UserData);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, 'users/' + u.uid);
        }

        onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            setUserData(snap.data() as UserData);
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, 'users/' + u.uid);
        });
      } else {
        setUserData(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = async (email: string, pass: string) => {
    setIsAuthenticating(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      toast.success('Welcome back!');
    } catch (e: any) {
      toast.error(e.message || 'Login failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signInWithGoogle = async () => {
    setIsAuthenticating(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      const docRef = doc(db, 'users', u.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        const newData: UserData = {
          uid: u.uid,
          email: u.email || '',
          displayName: u.displayName || 'User',
          balance: 0,
          role: u.email === 'chenwave9@gmail.com' ? 'admin' : 'user',
          isBlocked: false,
          photoURL: u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || 'User')}&background=2563eb&color=fff`,
          referralCode: generateReferralCode(),
          hasSeenReferralModal: false,
          createdAt: Timestamp.now()
        };
        await setDoc(docRef, newData);
        setUserData(newData);
      }
      toast.success('Welcome!');
    } catch (e: any) {
      toast.error(e.message || 'Google Login failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signUp = async (email: string, pass: string, name: string, phone: string, refCode?: string) => {
    setIsAuthenticating(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const u = userCredential.user;
      await updateProfile(u, { displayName: name });

      let referredBy = '';
      if (refCode) {
        const q = query(collection(db, 'users'), where('referralCode', '==', refCode.toUpperCase()), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          referredBy = snap.docs[0].id;
        }
      }

      const newData: UserData = {
        uid: u.uid,
        email: email,
        displayName: name,
        phoneNumber: phone,
        balance: 0,
        role: email === 'chenwave9@gmail.com' ? 'admin' : 'user',
        isBlocked: false,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff`,
        referralCode: generateReferralCode(),
        referredBy: referredBy,
        hasSeenReferralModal: true, // Already provided refCode or skipped during manual signup
        createdAt: Timestamp.now()
      };

      await setDoc(doc(db, 'users', u.uid), newData);
      setUserData(newData);
      toast.success('Account created successfully!');
    } catch (e: any) {
      toast.error(e.message || 'Registration failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAuthenticating, signIn, signInWithGoogle, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Components ---

const Logo = ({ className }: { className?: string }) => (
  <img 
    src="https://lh3.googleusercontent.com/d/1djn0yjIXoKpDaSLRUzgdDM979XuvumIF" 
    alt="PT. Garudaku Logo" 
    className={cn("object-contain", className)}
    referrerPolicy="no-referrer"
  />
);

const LoadingScreen = () => (
  <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center z-50">
    <motion.div
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      className="mb-4"
    >
      <Logo className="w-16 h-16" />
    </motion.div>
    <p className="text-zinc-400 font-mono text-sm tracking-widest uppercase">PT. Garudaku Loading...</p>
  </div>
);

const MarketVisual = () => (
  <div className="relative w-full h-80 rounded-3xl overflow-hidden mb-8 group border border-zinc-800">
    <iframe 
      src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_12345&symbol=BINANCE%3ABTCUSDT&interval=D&hidesidetoolbar=1&hidetoptoolbar=1&symboledit=0&saveimage=0&toolbarbg=0a0a0a&theme=dark&style=1&timezone=Etc%2FUTC&locale=en"
      className="w-full h-full border-none"
      title="BTC/USDT Live Chart"
    />
    <div className="absolute bottom-4 left-4 pointer-events-none">
      <div className="flex items-center gap-2 mb-1">
        <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-[8px] font-mono text-blue-500 uppercase tracking-widest">Live BTC/USDT</span>
      </div>
    </div>
  </div>
);

const StatCard = ({ label, value, icon: Icon, color }: { label: string, value: string, icon: any, color: string }) => (
  <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl hover:border-zinc-700 transition-colors">
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">{label}</span>
      <div className={cn("p-2 rounded-xl", color)}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
    <div className="text-xl font-bold text-white tracking-tight">{value}</div>
  </div>
);

const TradingViewChart = () => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if ((window as any).TradingView) {
        new (window as any).TradingView.widget({
          "width": "100%",
          "height": 400,
          "symbol": "BINANCE:BTCUSDT",
          "interval": "D",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#f1f3f6",
          "enable_publishing": false,
          "allow_symbol_change": true,
          "container_id": "tradingview_chart"
        });
      }
    };
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden mb-8">
      <div id="tradingview_chart" />
    </div>
  );
};

interface Plan {
  id: string;
  name: string;
  minPrice: number;
  logoUrl: string;
  color: string;
  bgColor: string;
  requiredVipLevel?: number;
}

const DURATION_OPTIONS = [
  { days: 7, profitPct: 0.20 },
  { days: 15, profitPct: 0.50 },
  { days: 20, profitPct: 0.70 },
  { days: 30, profitPct: 1.30 },
];

const VVIP_DURATION_OPTIONS = [
  { days: 2, profitPct: 1.00 },
  { days: 5, profitPct: 1.50 },
  { days: 7, profitPct: 2.00 },
];

const INVESTMENT_PLANS: Plan[] = [
  {
    id: 'btc',
    name: 'Bitcoin (BTC)',
    minPrice: 50000,
    logoUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10'
  },
  {
    id: 'eth',
    name: 'Ethereum (ETH)',
    minPrice: 100000,
    logoUrl: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  {
    id: 'vvip1',
    name: 'VVIP 1 Plan',
    minPrice: 100000,
    logoUrl: 'https://cdn-icons-png.flaticon.com/512/2583/2583344.png',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    requiredVipLevel: 1
  }
];

interface InvestmentPlanProps {
  plan: Plan;
  onBuy: (plan: Plan, amount: number, duration: number, profitPct: number) => void;
}

const InvestmentPlan: React.FC<InvestmentPlanProps> = ({ plan, onBuy }) => {
  const { userData } = useAuth();
  const [amount, setAmount] = useState(plan.minPrice.toString());
  const [durationIdx, setDurationIdx] = useState(0);
  
  const options = plan.requiredVipLevel ? VVIP_DURATION_OPTIONS : DURATION_OPTIONS;
  const currentVip = (userData?.vipLevel || 0);
  const effectiveVip = (userData?.balance && userData.balance >= 100000) ? Math.max(currentVip, 1) : currentVip;
  const isLocked = plan.requiredVipLevel && effectiveVip < plan.requiredVipLevel;
  const selectedOption = options[durationIdx];
  const numAmount = Number(amount.toString().replace(/[^0-9]/g, '') || '0');
  const totalProfit = numAmount * selectedOption.profitPct;

  return (
    <div className={cn(
      "bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden group transition-all duration-500",
      isLocked ? "opacity-75 grayscale-[0.5]" : "hover:border-blue-500/50"
    )}>
      <div className="flex items-center gap-4 mb-6">
        <div className={cn("p-4 rounded-2xl", plan.bgColor)}>
          <img src={plan.logoUrl} className="w-7 h-7 object-contain" alt={plan.name} referrerPolicy="no-referrer" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{plan.name}</h3>
          <p className="text-xs text-zinc-500">Nexa Trading AI #{plan.id.toUpperCase()}</p>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Investment Amount</label>
          <input 
            type="number" 
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm"
            placeholder={`Min ${formatCurrency(plan.minPrice)}`}
          />
        </div>

        <div>
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Select Duration</label>
          <div className="grid grid-cols-2 gap-2">
            {options.map((opt, idx) => (
              <button
                key={opt.days}
                onClick={() => setDurationIdx(idx)}
                className={cn(
                  "py-2 rounded-xl text-xs font-bold border transition-all",
                  durationIdx === idx 
                    ? "bg-blue-600 border-blue-500 text-white" 
                    : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                )}
              >
                {opt.days} Days ({opt.profitPct * 100}%)
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Estimated Profit</span>
            <span className="text-green-500 font-bold">+{formatCurrency(totalProfit)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">Total Return (Capital + Profit)</span>
            <span className="text-blue-500 font-bold">{formatCurrency(numAmount + totalProfit)}</span>
          </div>
        </div>
      </div>

      <button 
        onClick={() => {
          console.log('InvestmentPlan button clicked:', { plan, numAmount, days: selectedOption.days, profitPct: selectedOption.profitPct });
          onBuy(plan, numAmount, selectedOption.days, selectedOption.profitPct);
        }}
        disabled={isLocked || !amount || numAmount < plan.minPrice}
        className={cn(
          "w-full font-bold py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2",
          isLocked || !amount || numAmount < plan.minPrice
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
            : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
        )}
      >
        {isLocked ? (
          <>
            <ShieldCheck className="w-5 h-5" />
            Requires VVIP Status
          </>
        ) : (
          <>
            <TrendingUp className="w-5 h-5" />
            Start Investment
          </>
        )}
      </button>
      
      {isLocked && (
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <p className="text-[10px] text-yellow-500 leading-relaxed">
            Upgrade to VVIP by depositing min 100k or inviting a friend who deposits 100k.
          </p>
        </div>
      )}
    </div>
  );
};


interface UserRowProps {
  user: UserData;
  onAdjust: (uid: string, isAdd: boolean, amount: string) => Promise<void>;
  onClear: (uid: string) => Promise<void>;
  onBlock: (uid: string, current: boolean) => Promise<void>;
}

const UserRow: React.FC<UserRowProps> = ({ user, onAdjust, onClear, onBlock }) => {
  const [amount, setAmount] = useState('');

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src={user.photoURL} className="w-10 h-10 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              {user.displayName}
              {((user.vipLevel || 0) >= 1 || user.balance >= 100000) && (
                <span className="bg-yellow-500/10 text-yellow-500 text-[8px] font-bold px-2 py-0.5 rounded-full border border-yellow-500/20">VVIP</span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500">{user.email}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-blue-500">{formatCurrency(user.balance)}</div>
          <div className="text-[10px] text-zinc-500 uppercase font-mono">{user.role}</div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input 
            type="number" 
            placeholder="Custom amount..." 
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <button 
            onClick={() => { onAdjust(user.uid, true, amount); setAmount(''); }}
            className="px-4 py-2 bg-green-500/10 text-green-500 rounded-xl text-xs font-bold hover:bg-green-500/20"
          >
            Add
          </button>
          <button 
            onClick={() => { onAdjust(user.uid, false, amount); setAmount(''); }}
            className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl text-xs font-bold hover:bg-red-500/20"
          >
            Sub
          </button>
          <button 
            onClick={() => onClear(user.uid)}
            className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-700 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
        <button 
          onClick={() => onBlock(user.uid, user.isBlocked)}
          className={cn("w-full py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2",
            user.isBlocked ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          )}
        >
          <Ban className="w-3 h-3" />
          {user.isBlocked ? 'Unblock' : 'Block'}
        </button>
      </div>
    </div>
  );
};

const AdminPanel = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProof, setSelectedProof] = useState<string | null>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserData));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    const unsubTx = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc')), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));
    setLoading(false);
    return () => { unsubUsers(); unsubTx(); };
  }, []);

  const handleStatus = async (txId: string, status: 'approved' | 'rejected', uid: string, amount: number, type: string) => {
    try {
      const batch = writeBatch(db);
      const txRef = doc(db, 'transactions', txId);
      const userRef = doc(db, 'users', uid);

      // Fetch user data to check for referrer
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data() as UserData;

      batch.update(txRef, { status });

      if (status === 'approved') {
        if (type === 'deposit') {
          const updates: any = { balance: increment(amount) };
          
          // VVIP Upgrade Logic (Min 100k balance or deposit)
          if ((amount >= 100000 || (userData.balance + amount) >= 100000) && (!userData.vipLevel || userData.vipLevel < 1)) {
            updates.vipLevel = 1;
          }
          
          batch.update(userRef, updates);

          // VVIP Cashback (20% for VVIP members on their own deposits)
          if (userData?.vipLevel && userData.vipLevel >= 1) {
            const cashbackAmount = Math.floor(amount * 0.2);
            batch.update(userRef, { balance: increment(cashbackAmount) });
            
            const cashbackTxRef = doc(collection(db, 'transactions'));
            batch.set(cashbackTxRef, {
              uid: userData.uid,
              amount: cashbackAmount,
              type: 'deposit',
              status: 'approved',
              description: `VVIP Cashback (20%)`,
              createdAt: Timestamp.now()
            });
          }

          // Referral Reward (20% of deposit)
          if (userData?.referredBy) {
            const referrerRef = doc(db, 'users', userData.referredBy);
            const rewardAmount = Math.floor(amount * 0.2);
            
            // If deposit is >= 100k, upgrade referrer to VVIP too
            const referrerUpdates: any = { balance: increment(rewardAmount) };
            if (amount >= 100000) {
              referrerUpdates.vipLevel = 1;
            }
            
            batch.update(referrerRef, referrerUpdates);
            
            // Create transaction record for referral reward
            const rewardTxRef = doc(collection(db, 'transactions'));
            batch.set(rewardTxRef, {
              uid: userData.referredBy,
              amount: rewardAmount,
              type: 'deposit',
              status: 'approved',
              description: `Referral reward from ${userData.displayName}`,
              createdAt: Timestamp.now()
            });
          }
        } else {
          // Withdrawal already deducted from balance on request
        }
      } else if (status === 'rejected' && type === 'withdraw') {
        // Refund balance if withdrawal rejected
        batch.update(userRef, { balance: increment(amount) });
      }

      await batch.commit();
      toast.success(`Transaction ${status}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions/status');
    }
  };

  const toggleBlock = async (uid: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), { isBlocked: !current });
      toast.success(current ? 'User unblocked' : 'User blocked');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users/' + uid);
    }
  };

  const adjustBalance = async (uid: string, isAdd: boolean, amountStr: string) => {
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', uid), { balance: increment(isAdd ? amount : -amount) });
      toast.success('Balance adjusted');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users/' + uid);
    }
  };

  const clearBalance = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { balance: 0 });
      toast.success('Balance cleared to 0');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users/' + uid);
    }
  };

  if (loading) return <div>Loading Admin...</div>;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-500" />
          Pending Requests
        </h3>
        <div className="space-y-3">
          {transactions.filter(t => t.status === 'pending').map(t => (
            <div key={t.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", 
                      t.type === 'deposit' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {t.type}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">{t.uid.slice(0, 8)}...</span>
                  </div>
                  <div className="text-lg font-bold text-white">{formatCurrency(t.amount)}</div>
                  {t.type === 'withdraw' && (
                    <div className="bg-zinc-950/50 border border-zinc-800 p-3 rounded-xl mt-2 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-500 uppercase">Fee (5%)</span>
                        <span className="text-red-500">{formatCurrency(t.fee || 0)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-500 uppercase">Net Amount</span>
                        <span className="text-green-500 font-bold">{formatCurrency(t.netAmount || 0)}</span>
                      </div>
                      <div className="pt-2 border-t border-zinc-800 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-500 uppercase">Method</span>
                          <span className="text-white font-mono">{t.method}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-500 uppercase">Account Name</span>
                          <span className="text-white font-mono">{t.accountName}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-500 uppercase">Account Number</span>
                          <span className="text-white font-mono">{t.accountNumber}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {t.type === 'deposit' && (
                    <div className="text-[10px] text-zinc-500 mt-1">
                      Method: {t.method}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {t.proofURL && (
                    <button 
                      onClick={() => setSelectedProof(t.proofURL!)}
                      className="p-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-xl transition-colors"
                    >
                      <HistoryIcon className="w-5 h-5" />
                    </button>
                  )}
                  <button 
                    onClick={() => handleStatus(t.id, 'approved', t.uid, t.amount, t.type)}
                    className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-xl transition-colors"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleStatus(t.id, 'rejected', t.uid, t.amount, t.type)}
                    className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-colors"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {transactions.filter(t => t.status === 'pending').length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-8">No pending requests</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <UserIcon className="w-5 h-5 text-blue-500" />
          User Management
        </h3>
        <div className="space-y-3">
          {users.map(u => (
            <UserRow 
              key={u.uid} 
              user={u} 
              onAdjust={adjustBalance} 
              onClear={clearBalance} 
              onBlock={toggleBlock} 
            />
          ))}
        </div>
      </section>

      {/* Proof Modal */}
      <AnimatePresence>
        {selectedProof && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-950/90 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-lg w-full bg-zinc-900 rounded-3xl overflow-hidden"
            >
              <button 
                onClick={() => setSelectedProof(null)}
                className="absolute top-4 right-4 p-2 bg-zinc-950/50 rounded-full text-white z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={selectedProof} alt="Proof" className="w-full h-auto" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <section className="mt-8">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          Support Center
        </h3>
        <SupportAdmin />
      </section>
    </div>
  );
};

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Show toast to user
  if (errInfo.error.includes('permission-denied')) {
    toast.error('Gagal: Izin ditolak. Silakan hubungi admin.');
  } else {
    toast.error(`Error: ${errInfo.error}`);
  }

  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error?.message || "");
        if (parsedError.error) {
          errorMessage = `Firestore Error: ${parsedError.error} (${parsedError.operationType} on ${parsedError.path})`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-4">Application Error</h2>
            <p className="text-zinc-400 text-sm mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Main App ---

const ReferralTab = () => {
  const { userData } = useAuth();
  const [referrals, setReferrals] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalEarned, setTotalEarned] = useState(0);

  useEffect(() => {
    if (!userData) return;
    const q = query(collection(db, 'users'), where('referredBy', '==', userData.uid), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setReferrals(snap.docs.map(d => d.data() as UserData));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users/referrals'));

    // Calculate total earned from referral rewards
    const qRewards = query(
      collection(db, 'transactions'), 
      where('uid', '==', userData.uid),
      where('description', '>=', 'Referral reward'),
      where('description', '<=', 'Referral reward\uf8ff')
    );
    const unsubRewards = onSnapshot(qRewards, (snap) => {
      const total = snap.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
      setTotalEarned(total);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions/referral_rewards'));

    return () => {
      unsub();
      unsubRewards();
    };
  }, [userData]);

  const copyRefLink = () => {
    const link = `${window.location.origin}/?ref=${userData?.referralCode}`;
    navigator.clipboard.writeText(link);
    toast.success('Referral link copied!');
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Gift className="w-32 h-32 rotate-12" />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-white mb-2">Refer & Earn</h2>
          <p className="text-blue-100 text-sm mb-6">Invite your friends and earn <span className="font-bold text-white underline decoration-white/30 underline-offset-4">20% commission</span> on every deposit they make.</p>
          
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[10px] text-blue-200 uppercase tracking-widest mb-1">Your Referral Code</p>
              <p className="text-xl font-mono font-bold text-white tracking-widest">{userData?.referralCode}</p>
            </div>
            <button 
              onClick={copyRefLink}
              className="p-3 bg-white text-blue-600 rounded-xl hover:bg-blue-50 transition-colors shadow-lg"
            >
              <Copy className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Total Referrals</p>
          <p className="text-2xl font-bold text-white">{referrals.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Total Earned</p>
          <p className="text-2xl font-bold text-green-500">{formatCurrency(totalEarned)}</p>
        </div>
      </div>

      <section>
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-blue-500" />
          Your Network
        </h3>
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-zinc-500">Loading network...</div>
          ) : referrals.length > 0 ? (
            referrals.map(ref => (
              <div key={ref.uid} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold">
                    {ref.displayName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{ref.displayName}</p>
                    <p className="text-[10px] text-zinc-500">{ref.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-blue-500">{formatCurrency(ref.balance)}</p>
                  <p className="text-[8px] text-zinc-600 uppercase tracking-tighter">Active Member</p>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-zinc-900/30 border border-dashed border-zinc-800 p-12 rounded-3xl text-center">
              <Share2 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500 text-sm">No referrals yet. Start sharing!</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const HistoryTab = ({ transactions }: { transactions: Transaction[] }) => {
  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Transaction History</h2>
        <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl">
          <HistoryIcon className="w-5 h-5 text-zinc-500" />
        </div>
      </div>

      <div className="space-y-3">
        {transactions.length > 0 ? (
          transactions.map(t => (
            <div key={t.id} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl group hover:border-zinc-700 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-xl", 
                    t.type === 'deposit' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                  )}>
                    {t.type === 'deposit' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white capitalize">{t.type}</p>
                    <p className="text-[10px] text-zinc-500">{t.createdAt.toDate().toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-bold", 
                    t.type === 'deposit' ? "text-green-500" : "text-red-500"
                  )}>
                    {t.type === 'deposit' ? '+' : '-'}{formatCurrency(t.amount)}
                  </p>
                  <span className={cn("text-[8px] font-bold uppercase px-2 py-0.5 rounded-full",
                    t.status === 'approved' ? "bg-green-500/10 text-green-500" :
                    t.status === 'pending' ? "bg-amber-500/10 text-amber-500" :
                    "bg-red-500/10 text-red-500"
                  )}>
                    {t.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-3 border-t border-zinc-800/50">
                <span>ID: {t.id.slice(0, 12)}...</span>
                <span>{t.method}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20">
            <Clock className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 text-sm">No transactions found</p>
          </div>
        )}
      </div>
    </div>
  );
};

const AccountTab = ({ onDeposit, onWithdraw, onEditProfile, onSupport, onFAQ }: { onDeposit: () => void, onWithdraw: () => void, onEditProfile: () => void, onSupport: () => void, onFAQ: () => void }) => {
  const { userData, logout } = useAuth();
  const effectiveVip = (userData?.balance && userData.balance >= 100000) ? Math.max(userData.vipLevel || 0, 1) : (userData?.vipLevel || 0);

  return (
    <div className="space-y-6 pb-24">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-blue-600/20 to-transparent" />
        <div className="relative z-10">
          <div className="w-24 h-24 rounded-full border-4 border-zinc-950 mx-auto mb-4 overflow-hidden shadow-2xl">
            <img src={userData?.photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">{userData?.displayName}</h2>
          <div className="flex items-center justify-center gap-2 mb-4">
            <p className="text-zinc-500 text-sm">{userData?.email}</p>
            {effectiveVip >= 1 && (
              <span className="bg-yellow-500/10 text-yellow-500 text-[8px] font-bold px-2 py-0.5 rounded-full border border-yellow-500/20">VVIP</span>
            )}
          </div>
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-zinc-950 border border-zinc-800 rounded-full">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
              {userData?.role === 'admin' ? 'System Administrator' : `VIP Level ${effectiveVip}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Available Balance</p>
              <p className="text-3xl font-bold text-white tracking-tight">{formatCurrency(userData?.balance || 0)}</p>
            </div>
            <div className="p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20">
              <Wallet className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onDeposit}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <ArrowDownCircle className="w-4 h-4" />
              Deposit
            </button>
            <button 
              onClick={onWithdraw}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <ArrowUpCircle className="w-4 h-4" />
              Withdraw
            </button>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Account Settings</p>
        </div>
        <div className="divide-y divide-zinc-800">
          <button 
            onClick={onEditProfile}
            className="w-full p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-zinc-800 rounded-xl text-zinc-400 group-hover:text-blue-500 transition-colors">
                <Settings className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-zinc-300">Profile Settings</span>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-700" />
          </button>
          <button 
            onClick={onSupport}
            className="w-full p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-zinc-800 rounded-xl text-zinc-400 group-hover:text-blue-500 transition-colors">
                <MessageSquare className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-zinc-300">Customer Service</span>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-700" />
          </button>
          <button 
            onClick={onFAQ}
            className="w-full p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-zinc-800 rounded-xl text-zinc-400 group-hover:text-blue-500 transition-colors">
                <HelpCircle className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-zinc-300">FAQ</span>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-700" />
          </button>
          <button 
            onClick={logout}
            className="w-full p-5 flex items-center justify-between hover:bg-red-500/5 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-red-500/10 rounded-xl text-red-500">
                <LogOut className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-red-500">Sign Out</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

const BottomNav = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: any) => void }) => {
  const tabs = [
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'plan', icon: Briefcase, label: 'Plan' },
    { id: 'referral', icon: Gift, label: 'Referral' },
    { id: 'history', icon: HistoryIcon, label: 'History' },
    { id: 'account', icon: User, label: 'Account' },
  ];

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-[#2d333d] backdrop-blur-xl border border-white/5 p-2 rounded-[2.5rem] flex items-center gap-1 shadow-2xl shadow-black/50">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-full transition-all duration-300",
              activeTab === tab.id 
                ? "bg-white text-zinc-950 shadow-lg" 
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <tab.icon className={cn("w-5 h-5", activeTab === tab.id ? "stroke-[2.5px]" : "stroke-[2px]")} />
            {activeTab === tab.id && (
              <span className="text-sm font-bold tracking-tight">{tab.label}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const Login = () => {
  const { signIn, signInWithGoogle, signUp, isAuthenticating } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [refCode, setRefCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setRefCode(ref.toUpperCase());
      setIsSignUp(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (siteKey && !turnstileToken) {
      toast.error('Please complete the bot protection check');
      return;
    }

    if (isSignUp) {
      if (!name || !phone || !email || !password) {
        toast.error('Please fill all fields');
        return;
      }
      await signUp(email, password, name, phone, refCode);
    } else {
      if (!email || !password) {
        toast.error('Please enter email and password');
        return;
      }
      await signIn(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-zinc-950 to-zinc-950">
      <div className="max-w-md w-full">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_-12px_rgba(37,99,235,0.5)] overflow-hidden">
            <Logo className="w-full h-full" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tighter mb-2 uppercase">PT. GARUDAKU</h1>
          <p className="text-zinc-400 text-sm">Platform Investasi Saham Terpercaya</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl"
        >
          <button 
            onClick={signInWithGoogle}
            disabled={isAuthenticating}
            className="w-full bg-white text-zinc-950 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-zinc-100 transition-all active:scale-95 disabled:opacity-50 mb-6 shadow-xl"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Sign In with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-900 px-2 text-zinc-500 font-mono tracking-widest">Or continue with</span>
            </div>
          </div>

          <div className="flex gap-4 mb-8 p-1 bg-zinc-950 rounded-2xl">
            <button 
              onClick={() => setIsSignUp(false)}
              className={cn("flex-1 py-3 rounded-xl text-sm font-bold transition-all", !isSignUp ? "bg-zinc-800 text-white" : "text-zinc-500")}
            >
              Sign In
            </button>
            <button 
              onClick={() => setIsSignUp(true)}
              className={cn("flex-1 py-3 rounded-xl text-sm font-bold transition-all", isSignUp ? "bg-zinc-800 text-white" : "text-zinc-500")}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Enter your name..." 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest ml-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      type="tel" 
                      placeholder="e.g. 08123456789" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="email" 
                  placeholder="Enter your email..." 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="password" 
                  placeholder="Enter password..." 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
            {isSignUp && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest ml-1">Referral Code (Optional)</label>
                <div className="relative">
                  <Gift className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input 
                    type="text" 
                    placeholder="Enter code..." 
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="py-2 flex justify-center">
              <Turnstile 
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || ""} 
                onSuccess={(token) => setTurnstileToken(token)}
              />
            </div>

            <button 
              type="submit"
              disabled={isAuthenticating}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
            >
              {isAuthenticating ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <TrendingUp className="w-5 h-5" />
                </motion.div>
              ) : (
                isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />
              )}
              {isAuthenticating ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>
          
          <p className="mt-6 text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed text-center">
            By continuing, you agree to our Terms of Service and Trading Protocols.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

const ReferralModal = ({ isOpen, onClose, onApply }: { isOpen: boolean, onClose: () => void, onApply: (code: string) => void }) => {
  const [code, setCode] = useState('');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="relative flex-1 overflow-y-auto">
              <div className="relative w-full aspect-[3/4] md:aspect-video bg-zinc-950">
                <img 
                  src="https://lh3.googleusercontent.com/d/1batxBbwFNSZXVkE2Cf0mwILmUkML0n3W" 
                  alt="Referral Poster" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md text-white rounded-full hover:bg-black/70 transition-colors z-20"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Gift className="w-8 h-8 text-blue-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Punya Kode Referral?</h2>
                <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                  Masukkan kode referral temanmu untuk mendapatkan bonus spesial dan bergabung dalam jaringan investasi kami.
                </p>
                
                <div className="space-y-4">
                  <div className="relative">
                    <Gift className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Masukkan kode di sini..." 
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-colors text-center font-mono tracking-widest"
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={onClose}
                      className="flex-1 py-4 bg-zinc-800 text-zinc-400 font-bold rounded-2xl hover:bg-zinc-700 transition-all"
                    >
                      Lewati
                    </button>
                    <button 
                      onClick={() => onApply(code)}
                      disabled={!code}
                      className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-600/20"
                    >
                      Gunakan Kode
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const FAQ_DATA = [
  {
    q: "Apa itu PT. Garudaku?",
    a: "PT. Garudaku adalah platform investasi digital terpercaya yang berfokus pada perdagangan aset kripto dan pasar modal global."
  },
  {
    q: "Berapa minimal deposit?",
    a: "Minimal deposit adalah Rp 50.000 melalui metode pembayaran QRIS yang tersedia."
  },
  {
    q: "Berapa minimal penarikan?",
    a: "Minimal penarikan saldo adalah Rp 25.000 dengan biaya administrasi sebesar 5%."
  },
  {
    q: "Berapa lama proses penarikan dana?",
    a: "Proses penarikan dana biasanya memakan waktu 5-30 menit. Jika lebih dari itu, silakan hubungi Customer Service."
  },
  {
    q: "Bagaimana cara menjadi member VVIP?",
    a: "Anda otomatis menjadi member VVIP dengan melakukan deposit minimal Rp 100.000 atau mengundang teman yang melakukan deposit minimal Rp 100.000."
  },
  {
    q: "Apa keuntungan member VVIP?",
    a: "Member VVIP mendapatkan akses ke rencana investasi eksklusif dengan profit lebih tinggi (hingga 200%) dan mendapatkan cashback 20% untuk setiap deposit pribadi."
  }
];

const FAQTab = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-2">FAQ</h2>
        <p className="text-zinc-500">Pertanyaan yang sering diajukan seputar platform kami.</p>
      </div>

      <div className="space-y-3">
        {FAQ_DATA.map((item, idx) => (
          <div 
            key={idx} 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all"
          >
            <button 
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-zinc-800/50 transition-colors"
            >
              <span className="text-sm font-bold text-white">{item.q}</span>
              <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", openIdx === idx && "rotate-180")} />
            </button>
            <AnimatePresence>
              {openIdx === idx && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-4"
                >
                  <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-800 pt-4">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
};

interface SupportMessage {
  id: string;
  uid: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Timestamp;
  isAdmin: boolean;
}

const SupportTab = () => {
  const { user, userData } = useAuth();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'support_chats'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'support_chats'));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!user || !userData || !newMessage.trim()) return;
    try {
      await addDoc(collection(db, 'support_chats'), {
        uid: user.uid,
        senderId: user.uid,
        senderName: userData.displayName || 'User',
        text: newMessage,
        createdAt: Timestamp.now(),
        isAdmin: false
      });
      setNewMessage('');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'support_chats');
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Customer Service</h3>
            <p className="text-[10px] text-green-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Online
            </p>
          </div>
        </div>
        <a 
          href="https://wa.me/6281234567890" 
          target="_blank" 
          rel="noreferrer"
          className="p-2 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500/20 transition-colors"
        >
          <Phone className="w-5 h-5" />
        </a>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-950/30">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex flex-col", msg.isAdmin ? "items-start" : "items-end")}>
            <div className={cn(
              "max-w-[80%] p-4 rounded-2xl text-sm",
              msg.isAdmin 
                ? "bg-zinc-800 text-white rounded-tl-none" 
                : "bg-blue-600 text-white rounded-tr-none"
            )}>
              {msg.text}
            </div>
            <span className="text-[8px] text-zinc-600 mt-1 uppercase font-mono">
              {msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <MessageSquare className="w-12 h-12 text-zinc-800 mb-4" />
            <p className="text-sm text-zinc-500">Halo! Ada yang bisa kami bantu? Silakan ketik pesan Anda di bawah ini.</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-zinc-900 border-t border-zinc-800">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button 
            onClick={sendMessage}
            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const SupportAdmin = () => {
  const [chats, setChats] = useState<{[key: string]: SupportMessage[]}>({});
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'support_chats'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const grouped: {[key: string]: SupportMessage[]} = {};
      snap.docs.forEach(d => {
        const msg = { id: d.id, ...d.data() } as SupportMessage;
        if (!grouped[msg.uid]) grouped[msg.uid] = [];
        grouped[msg.uid].push(msg);
      });
      setChats(grouped);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'support_chats/admin'));
    return unsub;
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedUid, chats]);

  const sendReply = async () => {
    if (!selectedUid || !reply.trim()) return;
    try {
      await addDoc(collection(db, 'support_chats'), {
        uid: selectedUid,
        senderId: 'admin',
        senderName: 'Admin Support',
        text: reply,
        createdAt: Timestamp.now(),
        isAdmin: true
      });
      setReply('');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'support_chats');
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-zinc-800 font-bold text-white text-sm">Active Chats</div>
        <div className="flex-1 overflow-y-auto">
          {Object.keys(chats).map(uid => {
            const lastMsg = chats[uid][chats[uid].length - 1];
            return (
              <button 
                key={uid}
                onClick={() => setSelectedUid(uid)}
                className={cn(
                  "w-full p-4 text-left border-b border-zinc-800/50 hover:bg-zinc-800 transition-colors",
                  selectedUid === uid && "bg-blue-600/10 border-l-4 border-l-blue-600"
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-bold text-white truncate max-w-[120px]">{lastMsg.senderName}</span>
                  <span className="text-[8px] text-zinc-500">{lastMsg.createdAt?.toDate().toLocaleTimeString()}</span>
                </div>
                <p className="text-[10px] text-zinc-500 truncate">{lastMsg.text}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col">
        {selectedUid ? (
          <>
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
              <span className="text-sm font-bold text-white">Chat with {chats[selectedUid][0].senderName}</span>
              <span className="text-[10px] text-zinc-500 font-mono uppercase">{selectedUid}</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-950/30">
              {chats[selectedUid].map(msg => (
                <div key={msg.id} className={cn("flex flex-col", msg.isAdmin ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-xl text-xs",
                    msg.isAdmin ? "bg-blue-600 text-white rounded-tr-none" : "bg-zinc-800 text-white rounded-tl-none"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-zinc-900 border-t border-zinc-800">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  placeholder="Type reply..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <button 
                  onClick={sendReply}
                  className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
            <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a chat to start replying</p>
          </div>
        )}
      </div>
    </div>
  );
};

const MainApp = () => {
  const { user, userData, loading, isAuthenticating, logout } = useAuth();
  const effectiveVip = (userData?.balance && userData.balance >= 100000) ? Math.max(userData.vipLevel || 0, 1) : (userData?.vipLevel || 0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'plan' | 'referral' | 'history' | 'account' | 'admin' | 'support' | 'faq'>('dashboard');
  const [depositModal, setDepositModal] = useState<{ isOpen: boolean, step: 1 | 2, amount: string, proof: string | null }>({
    isOpen: false,
    step: 1,
    amount: '',
    proof: null
  });
  const [withdrawModal, setWithdrawModal] = useState<{ isOpen: boolean, step: 1 | 2, amount: string, method: string, accountName: string, accountNumber: string }>({
    isOpen: false,
    step: 1,
    amount: '',
    method: 'Bank',
    accountName: '',
    accountNumber: ''
  });
  const [profileModal, setProfileModal] = useState({
    isOpen: false,
    name: '',
    phone: ''
  });

  const showReferralModal = userData && !userData.referredBy && !userData.hasSeenReferralModal;

  const handleApplyReferral = async (code: string) => {
    if (!userData || !user) return;
    try {
      const q = query(collection(db, 'users'), where('referralCode', '==', code.toUpperCase()), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        toast.error('Kode referral tidak valid');
        return;
      }
      const referrerId = snap.docs[0].id;
      if (referrerId === user.uid) {
        toast.error('Tidak bisa menggunakan kode sendiri');
        return;
      }
      await updateDoc(doc(db, 'users', user.uid), {
        referredBy: referrerId,
        hasSeenReferralModal: true
      });
      toast.success('Kode referral berhasil digunakan!');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users/referral');
    }
  };

  const handleCloseReferralModal = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        hasSeenReferralModal: true
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users/referral_modal');
    }
  };

  // Data Listeners
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setInvestments([]);
      return;
    }

    // Real-time transactions
    const qTx = query(collection(db, 'transactions'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(100));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    // Real-time investments
    const qInv = query(collection(db, 'investments'), where('uid', '==', user.uid), limit(100));
    const unsubInv = onSnapshot(qInv, (snap) => {
      setInvestments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Investment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'investments'));

    return () => {
      unsubTx();
      unsubInv();
    };
  }, [user]);

  // Periodic Profit Check
  useEffect(() => {
    if (user) {
      checkAndAddProfit(user.uid);
      const interval = setInterval(() => checkAndAddProfit(user.uid), 1000 * 60 * 10); // Every 10 mins
      return () => clearInterval(interval);
    }
  }, [user]);

  // Automatic VVIP Upgrade Logic
  useEffect(() => {
    if (userData && userData.balance >= 100000 && (!userData.vipLevel || userData.vipLevel < 1)) {
      console.log('Automatic VVIP Upgrade triggered for:', userData.uid);
      updateDoc(doc(db, 'users', userData.uid), { vipLevel: 1 })
        .then(() => {
          toast.success('Selamat! Anda telah menjadi member VVIP!', {
            icon: '🌟',
            duration: 5000
          });
        })
        .catch(e => console.error('Error upgrading to VVIP:', e));
    }
  }, [userData?.balance, userData?.vipLevel]);

  const handleUpdateProfile = async () => {
    if (!userData || !profileModal.name) {
      toast.error('Name is required');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userData.uid), {
        displayName: profileModal.name,
        phoneNumber: profileModal.phone
      });
      toast.success('Profile updated!');
      setProfileModal({ ...profileModal, isOpen: false });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users/' + userData.uid);
    }
  };

   const checkAndAddProfit = async (uid: string) => {
    console.log('checkAndAddProfit checking for uid:', uid);
    try {
      const q = query(collection(db, 'investments'), where('uid', '==', uid), where('status', '==', 'active'));
      const snap = await getDocs(q);
      console.log(`Found ${snap.docs.length} active investments for profit check`);
      
      const now = new Date();
      const batch = writeBatch(db);
      let totalProfit = 0;
      let capitalReturn = 0;
      let updatedCount = 0;

      snap.docs.forEach(d => {
        const inv = d.data() as Investment;
        const lastUpdate = inv.lastProfitUpdate.toDate();
        const diffHours = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
        console.log(`Investment ${d.id}: diffHours=${diffHours.toFixed(2)}, daysLeft=${inv.daysLeft}`);

        if (diffHours >= 24) {
          const daysToUpdate = Math.floor(diffHours / 24);
          const actualDaysToUpdate = Math.min(daysToUpdate, inv.daysLeft);
          
          if (actualDaysToUpdate > 0) {
            const dailyProfit = (inv.profitPct && inv.totalDays)
              ? (inv.amount * inv.profitPct) / inv.totalDays 
              : inv.dailyProfit;
            
            const profit = actualDaysToUpdate * dailyProfit;
            const newDaysLeft = inv.daysLeft - actualDaysToUpdate;
            const isCompleted = newDaysLeft <= 0;
            
            console.log(`Updating ${d.id}: profit=${profit}, newDaysLeft=${newDaysLeft}, isCompleted=${isCompleted}`);
            
            batch.update(d.ref, {
              daysLeft: newDaysLeft,
              status: isCompleted ? 'completed' : 'active',
              lastProfitUpdate: Timestamp.now()
            });
            
            totalProfit += profit;
            if (isCompleted) {
              capitalReturn += inv.amount;
            }
            updatedCount++;
          }
        }
      });

      if (updatedCount > 0) {
        console.log(`Committing profit batch: totalProfit=${totalProfit}, capitalReturn=${capitalReturn}`);
        batch.update(doc(db, 'users', uid), { balance: increment(totalProfit + capitalReturn) });
        await batch.commit();
        if (totalProfit > 0) {
          toast.success(`Profit ditambahkan: ${formatCurrency(totalProfit)}`, { icon: '⛏️' });
        }
        if (capitalReturn > 0) {
          toast.success(`Modal dikembalikan: ${formatCurrency(capitalReturn)}`, { icon: '💰' });
        }
      } else {
        console.log('No profits to update at this time.');
      }
    } catch (err) {
      console.error('checkAndAddProfit error:', err);
      handleFirestoreError(err, OperationType.WRITE, 'investments/profit');
    }
  };

   const handleInvest = async (plan: Plan, amount: number, duration: number, profitPct: number) => {
    console.log('handleInvest called:', { plan, amount, duration, profitPct });
    if (!userData) {
      console.warn('handleInvest: No userData');
      return;
    }
    if (userData.balance < amount) {
      toast.error('Saldo tidak mencukupi');
      return;
    }

    const currentVip = (userData.vipLevel || 0);
    const effectiveVip = (userData.balance >= 100000) ? Math.max(currentVip, 1) : currentVip;

    if (plan.requiredVipLevel && effectiveVip < plan.requiredVipLevel) {
      toast.error(`Rencana ini memerlukan VIP ${plan.requiredVipLevel}. Deposit 100rb untuk upgrade.`);
      return;
    }

    const loadingToast = toast.loading('Memulai investasi...');

    try {
      const batch = writeBatch(db);
      const invRef = doc(collection(db, 'investments'));
      const userRef = doc(db, 'users', userData.uid);

      const investmentData = {
        uid: userData.uid,
        planName: plan.name,
        amount: amount,
        profitPct: profitPct,
        dailyProfit: (amount * profitPct) / duration,
        daysLeft: duration,
        totalDays: duration,
        status: 'active',
        lastProfitUpdate: Timestamp.now()
      };
      
      console.log('Creating investment:', investmentData);
      batch.set(invRef, investmentData);

      batch.update(userRef, { balance: increment(-amount) });

      await batch.commit();
      console.log('Investment batch committed successfully');
      toast.dismiss(loadingToast);
      toast.success(`${plan.name} berhasil dimulai!`, { icon: '🚀' });
    } catch (e) {
      console.error('Investment error:', e);
      toast.dismiss(loadingToast);
      handleFirestoreError(e, OperationType.WRITE, 'investments');
    }
  };

  const handleTransaction = async (type: 'deposit' | 'withdraw', amount: number, method: string, proofURL?: string, accountName?: string, accountNumber?: string, fee?: number, netAmount?: number) => {
    if (!userData) return;
    if (type === 'withdraw' && userData.balance < amount) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      const txRef = collection(db, 'transactions');
      await addDoc(txRef, {
        uid: userData.uid,
        type,
        amount,
        fee: fee || 0,
        netAmount: netAmount || amount,
        status: 'pending',
        method,
        accountName: accountName || null,
        accountNumber: accountNumber || null,
        proofURL: proofURL || null,
        createdAt: Timestamp.now()
      });

      if (type === 'withdraw') {
        await updateDoc(doc(db, 'users', userData.uid), { balance: increment(-amount) });
      }

      toast.success(`${type === 'deposit' ? 'Deposit' : 'Withdrawal'} request sent!`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions');
    }
  };

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Login />;
  }

  if (userData?.isBlocked) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="text-center">
          <Ban className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Account Blocked</h1>
          <p className="text-zinc-500">Please contact support for more information.</p>
          <button onClick={logout} className="mt-6 text-blue-500 font-bold underline">Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-blue-600/30">
      <ReferralModal 
        isOpen={!!showReferralModal} 
        onClose={handleCloseReferralModal} 
        onApply={handleApplyReferral} 
      />

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800 z-40 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <span className="text-lg font-bold text-white tracking-tighter uppercase">PT. Garudaku</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                {effectiveVip > 0 && (
                  <span className="text-[8px] font-black bg-amber-500 text-zinc-950 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">
                    VIP {effectiveVip}
                  </span>
                )}
                <div className="text-xs font-bold text-white">{userData?.displayName}</div>
              </div>
              <div className="text-[10px] text-blue-500 font-mono">{formatCurrency(userData?.balance || 0)}</div>
            </div>
            {userData?.role === 'admin' && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={cn("p-2 rounded-xl transition-colors", activeTab === 'admin' ? "bg-blue-600 text-white" : "bg-zinc-900 text-zinc-500")}
              >
                <ShieldCheck className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto pt-28 pb-32 px-6">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <MarketVisual />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                <StatCard label="Total Balance" value={formatCurrency(userData?.balance || 0)} icon={Wallet} color="bg-blue-500/10 text-blue-500" />
                <StatCard label="Active Investments" value={investments.filter(i => i.status === 'active').length.toString()} icon={TrendingUp} color="bg-green-500/10 text-green-500" />
                <StatCard label="Market Status" value="Bullish" icon={Activity} color="bg-cyan-500/10 text-cyan-500" />
              </div>

              <div className="space-y-6">
                <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    Active Plans
                  </h3>
                  <div className="space-y-3">
                    {investments.filter(i => i.status === 'active').map(i => (
                      <div key={i.id} className="bg-zinc-800/30 border border-zinc-800/50 p-4 rounded-2xl">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-bold text-white">{i.planName}</span>
                          <span className="text-[10px] font-mono text-blue-500 uppercase tracking-widest">{i.daysLeft} Days Left</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-500 h-full transition-all duration-1000" 
                            style={{ width: `${((i.totalDays - i.daysLeft) / i.totalDays) * 100}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] text-zinc-500">
                          <span>Progress</span>
                          <span>{formatCurrency(i.dailyProfit)} / Day</span>
                        </div>
                      </div>
                    ))}
                    {investments.filter(i => i.status === 'active').length === 0 && (
                      <p className="text-zinc-500 text-sm text-center py-8">No active plans</p>
                    )}
                  </div>
                </section>

                <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <HistoryIcon className="w-5 h-5 text-blue-500" />
                    Recent Activity
                  </h3>
                  <div className="space-y-4">
                    {transactions.slice(0, 5).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-xl border border-zinc-800/50">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg", t.type === 'deposit' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
                            {t.type === 'deposit' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white uppercase tracking-tight">{t.type}</div>
                            <div className="text-[10px] text-zinc-500">{t.createdAt.toDate().toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-white">{formatCurrency(t.amount)}</div>
                          <div className={cn("text-[10px] font-mono uppercase", 
                            t.status === 'approved' ? "text-green-500" : t.status === 'rejected' ? "text-red-500" : "text-zinc-500"
                          )}>
                            {t.status}
                          </div>
                        </div>
                      </div>
                    ))}
                    {transactions.length === 0 && (
                      <p className="text-zinc-500 text-sm text-center py-8">No recent activity to show.</p>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'plan' && (
            <motion.div 
              key="plan"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Investment Plans</h2>
                <p className="text-zinc-500">Choose a plan that fits your trading goals.</p>
              </div>
              
              <TradingViewChart />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {INVESTMENT_PLANS.map(plan => (
                  <InvestmentPlan key={plan.id} plan={plan} onBuy={handleInvest} />
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'referral' && (
            <motion.div 
              key="referral"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <ReferralTab />
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <HistoryTab transactions={transactions} />
            </motion.div>
          )}

          {activeTab === 'account' && (
            <motion.div 
              key="account"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <AccountTab 
                onDeposit={() => setDepositModal({ ...depositModal, isOpen: true, step: 1 })}
                onWithdraw={() => setWithdrawModal({ ...withdrawModal, isOpen: true, step: 1 })}
                onEditProfile={() => setProfileModal({ isOpen: true, name: userData?.displayName || '', phone: userData?.phoneNumber || '' })}
                onSupport={() => setActiveTab('support')}
                onFAQ={() => setActiveTab('faq')}
              />
            </motion.div>
          )}

          {activeTab === 'support' && (
            <motion.div 
              key="support"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <SupportTab />
            </motion.div>
          )}

          {activeTab === 'faq' && (
            <motion.div 
              key="faq"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <FAQTab />
            </motion.div>
          )}

          {activeTab === 'admin' && userData?.role === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <AdminPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Profile Modal */}
      <AnimatePresence>
        {profileModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-950/90 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Edit Profile</h3>
                <button onClick={() => setProfileModal({ ...profileModal, isOpen: false })} className="text-zinc-500"><X /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Full Name</label>
                  <input 
                    type="text" 
                    value={profileModal.name}
                    onChange={(e) => setProfileModal({ ...profileModal, name: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm"
                    placeholder="Enter your name"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Phone Number</label>
                  <input 
                    type="text" 
                    value={profileModal.phone}
                    onChange={(e) => setProfileModal({ ...profileModal, phone: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm"
                    placeholder="Enter phone number"
                  />
                </div>
                <button 
                  onClick={handleUpdateProfile}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-600/20"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deposit Modal */}
      <AnimatePresence>
        {depositModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-950/90 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Deposit Funds</h3>
                <button onClick={() => setDepositModal({ ...depositModal, isOpen: false })} className="text-zinc-500"><X /></button>
              </div>

              {depositModal.step === 1 ? (
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Amount (Min 50.000)</label>
                    <input 
                      type="number" 
                      placeholder="Enter amount..." 
                      value={depositModal.amount}
                      onChange={(e) => setDepositModal({ ...depositModal, amount: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const amt = parseInt(depositModal.amount);
                      if (isNaN(amt) || amt < 50000) {
                        toast.error('Minimum deposit is 50.000');
                        return;
                      }
                      setDepositModal({ ...depositModal, step: 2 });
                    }}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl"
                  >
                    Next Step
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center">
                    <p className="text-sm text-zinc-400 mb-4">Scan QRIS to pay</p>
                    <div className="bg-white p-4 rounded-2xl inline-block mb-4 shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)]">
                      <img 
                        src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=00020101021126570011ID.DANA.WWW011893600915300037050602090003705060303UMI51440014ID.CO.QRIS.WWW0215ID10264708165330303UMI5204594553033605802ID5912PT. Garudaku6013Kab. Sukabumi61051673063045116" 
                        alt="QRIS PT. Garudaku" 
                        className="w-48 h-auto" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <p className="text-xs text-zinc-500 mb-6">Screenshot your payment proof and upload below</p>
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setDepositModal({ ...depositModal, proof: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="w-full border-2 border-dashed border-zinc-800 rounded-2xl py-8 flex flex-col items-center justify-center text-zinc-500">
                      {depositModal.proof ? (
                        <img src={depositModal.proof} className="w-20 h-20 object-cover rounded-lg" />
                      ) : (
                        <>
                          <TrendingUp className="w-8 h-8 mb-2 opacity-20" />
                          <span className="text-xs">Upload Screenshot</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (!depositModal.proof) {
                        toast.error('Please upload payment proof');
                        return;
                      }
                      handleTransaction('deposit', parseInt(depositModal.amount), 'QRIS', depositModal.proof);
                      setDepositModal({ ...depositModal, isOpen: false });
                      toast.success('Proses memerlukan beberapa menit harap chat CS WhatsApp untuk mempercepat proses deposit', { duration: 6000 });
                    }}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl"
                  >
                    Submit Deposit
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {withdrawModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-950/90 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Withdraw Funds</h3>
                <button onClick={() => setWithdrawModal({ ...withdrawModal, isOpen: false })} className="text-zinc-500"><X /></button>
              </div>

              {withdrawModal.step === 1 ? (
                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Amount to Withdraw (Min 25.000)</label>
                    <input 
                      type="number" 
                      placeholder="Enter amount..." 
                      value={withdrawModal.amount}
                      onChange={(e) => setWithdrawModal({ ...withdrawModal, amount: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500"
                    />
                    {withdrawModal.amount && (
                      <div className="mt-2 text-[10px] text-zinc-500 flex justify-between">
                        <span>Fee (5%): {formatCurrency(parseInt(withdrawModal.amount) * 0.05)}</span>
                        <span>You Receive: {formatCurrency(parseInt(withdrawModal.amount) * 0.95)}</span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      const amt = parseInt(withdrawModal.amount);
                      if (isNaN(amt) || amt < 25000) {
                        toast.error('Minimum withdrawal is 25.000');
                        return;
                      }
                      if (userData && userData.balance < amt) {
                        toast.error('Insufficient balance');
                        return;
                      }
                      setWithdrawModal({ ...withdrawModal, step: 2 });
                    }}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl"
                  >
                    Next Step
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex gap-2">
                    {['Bank', 'E-Wallet'].map(m => (
                      <button 
                        key={m}
                        onClick={() => setWithdrawModal({ ...withdrawModal, method: m })}
                        className={cn("flex-1 py-3 rounded-xl text-xs font-bold transition-all", 
                          withdrawModal.method === m ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-500"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 block">{withdrawModal.method} Name</label>
                    <input 
                      type="text" 
                      placeholder={`e.g. ${withdrawModal.method === 'Bank' ? 'BCA, Mandiri' : 'DANA, OVO'}`}
                      value={withdrawModal.accountName}
                      onChange={(e) => setWithdrawModal({ ...withdrawModal, accountName: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 block">Account / Phone Number</label>
                    <input 
                      type="text" 
                      placeholder="Enter number..." 
                      value={withdrawModal.accountNumber}
                      onChange={(e) => setWithdrawModal({ ...withdrawModal, accountNumber: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (!withdrawModal.accountName || !withdrawModal.accountNumber) {
                        toast.error('Please fill all details');
                        return;
                      }
                      const amt = parseInt(withdrawModal.amount);
                      handleTransaction(
                        'withdraw', 
                        amt, 
                        withdrawModal.method, 
                        undefined, 
                        withdrawModal.accountName, 
                        withdrawModal.accountNumber,
                        amt * 0.05,
                        amt * 0.95
                      );
                      setWithdrawModal({ ...withdrawModal, isOpen: false });
                    }}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl"
                  >
                    Submit Withdrawal
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-zinc-900">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Logo className="w-6 h-6 grayscale" />
            <span className="text-xs font-bold tracking-tighter uppercase">PT. Garudaku © 2026</span>
          </div>
          <div className="flex gap-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            <a href="#" className="hover:text-zinc-400">Terms</a>
            <a href="#" className="hover:text-zinc-400">Privacy</a>
            <a href="#" className="hover:text-zinc-400">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-center" toastOptions={{
        style: { background: '#18181b', color: '#fff', border: '1px solid #27272a' }
      }} />
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
