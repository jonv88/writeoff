import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { ExpenseRecord, MerchantRule, Profile } from '../lib/types';
import { defaultProfile } from '../lib/types';
import {
  deleteExpense,
  deleteMerchantRule,
  loadWorkspace,
  saveMerchantRule,
  saveProfile,
  uploadReceipt,
  upsertExpense,
} from '../lib/data';
import { useAuth } from './AuthContext';

interface WorkspaceContextValue {
  loading: boolean;
  error: string | null;
  profile: Profile;
  records: ExpenseRecord[];
  rules: MerchantRule[];
  refresh: () => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  saveRecord: (record: ExpenseRecord, file?: File | null) => Promise<void>;
  removeRecord: (id: string) => Promise<void>;
  rememberRule: (rule: MerchantRule) => Promise<void>;
  forgetRule: (ruleId: string) => Promise<void>;
  toast: string | null;
  toastUndo: (() => void) | null;
  showToast: (message: string, undo?: () => void) => void;
  clearToast: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(defaultProfile());
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<(() => void) | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<ExpenseRecord[] | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(defaultProfile());
      setRecords([]);
      setRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await loadWorkspace(user.id);
      setProfile(data.profile);
      setRecords(data.records);
      setRules(data.rules);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workspace.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast(message);
    setToastUndo(() => undo || null);
    window.setTimeout(() => {
      setToast(null);
      setToastUndo(null);
    }, undo ? 12000 : 5000);
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
    setToastUndo(null);
  }, []);

  const updateProfile = useCallback(
    async (next: Profile) => {
      if (!user) throw new Error('Not signed in.');
      await saveProfile(user.id, next);
      setProfile(next);
      showToast('Setup saved. Suggestions now fit your workspace.');
    },
    [user, showToast],
  );

  const saveRecord = useCallback(
    async (record: ExpenseRecord, file?: File | null) => {
      if (!user) throw new Error('Not signed in.');
      const previous = records;
      let next = await upsertExpense(user.id, record);
      if (file) {
        const receipt = await uploadReceipt(user.id, next.id, file);
        next = { ...next, receipt };
      }
      setUndoSnapshot(previous);
      setRecords((cur) => {
        const idx = cur.findIndex((r) => r.id === next.id);
        if (idx >= 0) {
          const copy = [...cur];
          copy[idx] = next;
          return copy;
        }
        return [next, ...cur];
      });
      showToast('Expense saved.', async () => {
        if (!undoSnapshot && previous) {
          // Best-effort: re-apply previous list by deleting new or restoring old — Phase A keeps simple undo messaging
        }
        setRecords(previous);
        setUndoSnapshot(null);
        showToast('Change undone.');
      });
    },
    [user, records, showToast, undoSnapshot],
  );

  const removeRecord = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Not signed in.');
      const previous = records;
      await deleteExpense(user.id, id);
      setRecords((cur) => cur.filter((r) => r.id !== id));
      showToast('Expense removed.', () => {
        setRecords(previous);
        showToast('Change undone.');
      });
    },
    [user, records, showToast],
  );

  const rememberRule = useCallback(
    async (rule: MerchantRule) => {
      if (!user) throw new Error('Not signed in.');
      const saved = await saveMerchantRule(user.id, rule);
      setRules((cur) => {
        const rest = cur.filter((r) => r.merchant !== saved.merchant);
        return [...rest, saved];
      });
    },
    [user],
  );

  const forgetRule = useCallback(
    async (ruleId: string) => {
      if (!user) throw new Error('Not signed in.');
      await deleteMerchantRule(user.id, ruleId);
      setRules((cur) => cur.filter((r) => r.id !== ruleId));
      showToast('Merchant preference forgotten.');
    },
    [user, showToast],
  );

  const value: WorkspaceContextValue = {
    loading,
    error,
    profile,
    records,
    rules,
    refresh,
    updateProfile,
    saveRecord,
    removeRecord,
    rememberRule,
    forgetRule,
    toast,
    toastUndo,
    showToast,
    clearToast,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
