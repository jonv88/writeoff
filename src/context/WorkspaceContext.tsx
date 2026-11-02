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
  attachExistingReceipt,
  deleteExpense,
  deleteMerchantRule,
  loadWorkspace,
  saveMerchantRule,
  saveProfile,
  uploadReceipt,
  upsertExpense,
} from '../lib/data';
import {
  isLocalPreviewActive,
  loadLocalWorkspace,
  saveLocalWorkspace,
} from '../lib/localWorkspace';
import { suggestWriteOff } from '../lib/writeoffEngine';
import { useAuth } from './AuthContext';

interface WorkspaceContextValue {
  loading: boolean;
  error: string | null;
  localPreview: boolean;
  profile: Profile;
  records: ExpenseRecord[];
  rules: MerchantRule[];
  refresh: () => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  saveRecord: (record: ExpenseRecord, file?: File | null) => Promise<ExpenseRecord>;
  removeRecord: (id: string) => Promise<void>;
  rememberRule: (rule: MerchantRule) => Promise<void>;
  forgetRule: (ruleId: string) => Promise<void>;
  toast: string | null;
  toastUndo: (() => void) | null;
  showToast: (message: string, undo?: () => void) => void;
  clearToast: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function annotateSuggestion(record: ExpenseRecord, profile: Profile, rules: MerchantRule[]): ExpenseRecord {
  const s = suggestWriteOff(record, profile, rules);
  return {
    ...record,
    suggestedStatus: s.status,
    suggestedEligiblePercent: s.suggestedEligiblePercent,
    suggestedCategory: s.category,
    suggestedUse: s.use,
    suggestionRuleId: s.ruleId,
    suggestionRuleVersion: s.ruleVersion,
    suggestionReason: s.reason,
    currency: record.currency || 'USD',
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const localPreview = !user && isLocalPreviewActive();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(defaultProfile());
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<(() => void) | null>(null);

  const persistLocal = useCallback((next: { profile: Profile; records: ExpenseRecord[]; rules: MerchantRule[] }) => {
    saveLocalWorkspace(next);
    setProfile(next.profile);
    setRecords(next.records);
    setRules(next.rules);
  }, []);

  const refresh = useCallback(async () => {
    if (localPreview) {
      const data = loadLocalWorkspace();
      setProfile({ ...defaultProfile(), ...data.profile });
      setRecords(data.records);
      setRules(data.rules);
      setLoading(false);
      setError(null);
      return;
    }
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
      setProfile({ ...defaultProfile(), ...data.profile });
      setRecords(data.records);
      setRules(data.rules);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workspace.');
    } finally {
      setLoading(false);
    }
  }, [user, localPreview]);

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
      if (localPreview) {
        persistLocal({ profile: next, records, rules });
        showToast('Setup saved. Suggestions now fit your workspace.');
        return;
      }
      if (!user) throw new Error('Not signed in.');
      await saveProfile(user.id, next);
      setProfile(next);
      showToast('Setup saved. Suggestions now fit your workspace.');
    },
    [user, localPreview, persistLocal, records, rules, showToast],
  );

  const saveRecord = useCallback(
    async (record: ExpenseRecord, file?: File | null) => {
      const annotated = annotateSuggestion(record, profile, rules);
      if (localPreview) {
        const previous = records;
        let next = annotated;
        if (file) {
          const url = URL.createObjectURL(file);
          next = {
            ...next,
            receipt: {
              name: file.name,
              storagePath: `local/${next.id}/${file.name}`,
              localPreviewUrl: url,
              mimeType: file.type,
              sizeBytes: file.size,
              extractionStatus: next.receipt?.extractionStatus || 'none',
            },
            source: next.source || 'Receipt capture',
          };
        }
        const idx = previous.findIndex((r) => r.id === next.id);
        const list = idx >= 0 ? previous.map((r, i) => (i === idx ? next : r)) : [next, ...previous];
        persistLocal({ profile, records: list, rules });
        showToast('Expense saved.', () => {
          persistLocal({ profile, records: previous, rules });
          showToast('Change undone.');
        });
        return next;
      }
      if (!user) throw new Error('Not signed in.');
      const previous = records;
      let next = await upsertExpense(user.id, annotated);
      if (file) {
        const receipt = await uploadReceipt(user.id, next.id, file);
        next = { ...next, receipt };
        next = await upsertExpense(user.id, next);
      } else if (annotated.receipt?.storagePath?.startsWith(`${user.id}/`)) {
        const receipt = await attachExistingReceipt(user.id, next.id, annotated.receipt);
        next = { ...next, receipt };
      }
      setRecords((cur) => {
        const idx = cur.findIndex((r) => r.id === next.id);
        if (idx >= 0) {
          const copy = [...cur];
          copy[idx] = next;
          return copy;
        }
        return [next, ...cur];
      });
      showToast('Expense saved.', () => {
        setRecords(previous);
        showToast('Change undone.');
      });
      return next;
    },
    [user, localPreview, persistLocal, profile, records, rules, showToast],
  );

  const removeRecord = useCallback(
    async (id: string) => {
      const previous = records;
      if (localPreview) {
        persistLocal({ profile, records: records.filter((r) => r.id !== id), rules });
        showToast('Expense removed.', () => {
          persistLocal({ profile, records: previous, rules });
          showToast('Change undone.');
        });
        return;
      }
      if (!user) throw new Error('Not signed in.');
      await deleteExpense(user.id, id);
      setRecords((cur) => cur.filter((r) => r.id !== id));
      showToast('Expense removed.', () => {
        setRecords(previous);
        showToast('Change undone.');
      });
    },
    [user, localPreview, persistLocal, profile, records, rules, showToast],
  );

  const rememberRule = useCallback(
    async (rule: MerchantRule) => {
      if (localPreview) {
        const rest = rules.filter((r) => r.merchant !== rule.merchant);
        const saved = { ...rule, id: rule.id || `local-rule-${rule.merchant}` };
        persistLocal({ profile, records, rules: [...rest, saved] });
        return;
      }
      if (!user) throw new Error('Not signed in.');
      const saved = await saveMerchantRule(user.id, rule);
      setRules((cur) => {
        const rest = cur.filter((r) => r.merchant !== saved.merchant);
        return [...rest, saved];
      });
    },
    [user, localPreview, persistLocal, profile, records, rules],
  );

  const forgetRule = useCallback(
    async (ruleId: string) => {
      if (localPreview) {
        persistLocal({ profile, records, rules: rules.filter((r) => r.id !== ruleId) });
        showToast('Merchant preference forgotten.');
        return;
      }
      if (!user) throw new Error('Not signed in.');
      await deleteMerchantRule(user.id, ruleId);
      setRules((cur) => cur.filter((r) => r.id !== ruleId));
      showToast('Merchant preference forgotten.');
    },
    [user, localPreview, persistLocal, profile, records, rules, showToast],
  );

  const value: WorkspaceContextValue = {
    loading,
    error,
    localPreview,
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
