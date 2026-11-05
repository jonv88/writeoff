import assert from 'node:assert/strict';
import { categoryFor } from '../src/lib/core.ts';
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

assert.equal(categoryFor('Walgreens'), 'Other');
assert.equal(categoryFor('CVS Pharmacy'), 'Other');
assert.equal(categoryFor('City Hospital'), 'Other');

const walgreens = emptyExpense({
  id: 'w',
  merchant: 'Walgreens',
  amount: 8.49,
  date: '2026-11-05',
  category: '',
});
const savedMedicalRule = [{ merchant: 'walgreens', type: 'Business' as const, share: 100, category: 'Medical' }];

{
  const s = suggestWriteOff({ ...walgreens, items: [{ name: 'Snickers' }, { name: 'M&Ms' }] }, profile, []);
  assert.equal(s.category, 'Other');
  assert.notEqual(s.label, 'Possible personal tax record');
  assert.equal(s.status, 'needs_detail');
  assert.equal(s.suggestedEligiblePercent, null);
  assert.match(s.reason, /candy or snacks/i);
}

{
  const s = suggestWriteOff({ ...walgreens, notes: 'Snickers and a prescription' }, profile, []);
  assert.equal(s.category, 'Other');
  assert.match(s.reason, /not a medical purchase/i);
  assert.match(s.reason, /Snickers and a prescription/);
  assert.equal(s.suggestedEligiblePercent, null);
}

{
  const s = suggestWriteOff({ ...walgreens, notes: 'snickers' }, profile, savedMedicalRule);
  assert.equal(s.category, 'Other');
  assert.match(s.reason, /candy or snacks/i);
  assert.equal(s.suggestedEligiblePercent, null);
  assert.notEqual(s.status, 'possible_writeoff');
}

{
  const s = suggestWriteOff(walgreens, profile, savedMedicalRule);
  assert.equal(s.category, 'Other');
  assert.equal(s.question, 'What was purchased?');
  assert.notEqual(s.label, 'Possible personal tax record');
  assert.notEqual(s.status, 'possible_writeoff');
  assert.equal(s.suggestedEligiblePercent, null);
  assert.match(s.reason, /does not set tax eligibility/i);
}

{
  const s = suggestWriteOff(
    { ...walgreens, items: [{ name: 'Snickers' }, { name: 'Prescription' }, { name: 'Store brand item' }] },
    profile,
    savedMedicalRule,
  );
  assert.equal(s.category, 'Other');
  assert.notEqual(s.label, 'Possible personal tax record');
  assert.match(s.reason, /Snickers/);
  assert.match(s.reason, /Prescription/);
  assert.match(s.reason, /not a medical purchase/i);
  assert.match(s.question, /Which items were medical/i);
  assert.equal(s.suggestedEligiblePercent, null);
}

{
  const userMedical = emptyExpense({
    id: 'm',
    merchant: 'Walgreens',
    amount: 12,
    date: '2026-11-05',
    category: 'Medical',
    reviewed: true,
    treatmentSource: 'user',
    type: 'Personal',
  });
  const s = suggestWriteOff(
    { ...userMedical, items: [{ name: 'Snickers' }] },
    profile,
    savedMedicalRule,
  );
  assert.equal(s.status, 'user_entered');
  assert.equal(s.category, 'Medical');
  assert.equal(s.use, 'Personal');
  assert.equal(s.suggestedEligiblePercent, null);
}

{
  const s = suggestWriteOff(
    { ...walgreens, category: 'Other', categoryExplicit: true, notes: 'snickers' },
    profile,
    savedMedicalRule,
  );
  assert.equal(s.category, 'Other');
  assert.match(s.reason, /candy or snacks/i);
  assert.equal(s.suggestedEligiblePercent, null);
}

{
  const s = suggestWriteOff(
    { ...walgreens, category: 'Medical', categoryExplicit: true },
    profile,
    savedMedicalRule,
  );
  assert.equal(s.category, 'Medical');
  assert.equal(s.label, 'Possible personal tax record');
  assert.equal(s.suggestedEligiblePercent, null);
  assert.equal(s.use, 'Personal');
}

console.log('suggestion-harness: ok');
