import assert from 'node:assert/strict';
import { suggestWriteOff, summarizeExpenses } from '../src/lib/writeoffEngine.ts';
import { defaultProfile, emptyExpense } from '../src/lib/types.ts';

const profile = {
  ...defaultProfile(),
  mode: 'Both' as const,
  worktype: 'self' as const,
  industry: 'creative' as const,
  country: 'US',
  complete: true,
};

const adobe = emptyExpense({
  id: '1',
  merchant: 'Adobe Creative Cloud',
  amount: 59.99,
  date: '2026-10-15',
  category: 'Software & subscriptions',
});

const meal = emptyExpense({
  id: '2',
  merchant: 'Starbucks',
  amount: 6.75,
  date: '2026-10-20',
  category: 'Meals',
});

const personalProfile = { ...profile, mode: 'Personal' as const, worktype: 'personal' as const };

{
  const s = suggestWriteOff(adobe, profile, []);
  assert.equal(s.status, 'possible_writeoff');
  assert.match(s.label, /Possible write-off/i);
  assert.ok(s.ruleVersion);
}

{
  const s = suggestWriteOff(meal, profile, []);
  assert.equal(s.status, 'needs_detail');
  assert.ok(s.question);
}

{
  const s = suggestWriteOff(adobe, personalProfile, []);
  assert.equal(s.status, 'no_writeoff_identified');
}

{
  const userEntered = {
    ...adobe,
    reviewed: true,
    type: 'Business' as const,
    treatmentSource: 'user' as const,
    share: 100,
  };
  const s = suggestWriteOff(userEntered, profile, []);
  assert.equal(s.status, 'user_entered');
}

{
  const summary = summarizeExpenses([adobe, meal], profile, []);
  assert.ok(summary.total > 0);
  assert.ok(summary.possibleWriteOffs >= adobe.amount);
  assert.equal(summary.eligibleSelected, 0);
}

console.log('suggestion-harness: ok');
