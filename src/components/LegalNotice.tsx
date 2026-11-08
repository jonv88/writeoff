import { useState } from 'react';
import { APPROVED_PLAN } from '../lib/billing/plan';

const privacy = [
  'Writeoff stores the expenses, receipt photos, and setup you save in your account. Receipt photos stay in private storage, are limited to 3 MB, and are removed when you delete the expense or the account.',
  'Reading starts on this device. When ChatGPT reading is turned on, a missing merchant, date, or amount can send the photo to OpenAI. Saving an expense can also store the photo in private cloud storage. Veryfi is not used.',
  'Bank linking in this preview uses test data only. A real bank connection is not available.',
  'You can export your expenses from Setup and delete the account there. Deleting the account removes its records, receipt files, and sign-in.',
];

const terms = [
  `Writeoff Plus is ${APPROVED_PLAN.label}. Annual billing is not offered. A subscription starts only after the payment provider confirms it. Checkout is not turned on until that test is configured.`,
  'Suggestions organize records for review. They are not tax advice, and they do not set an eligible percentage.',
  'Canceling a subscription does not delete your records. You can still export them and delete the account.',
];

export function LegalNotice() {
  const [open, setOpen] = useState<'privacy' | 'terms' | null>(null);
  const paragraphs = open === 'privacy' ? privacy : open === 'terms' ? terms : [];
  return (
    <div>
      <p className="helper" style={{ marginTop: 12 }}>
        <button type="button" className="linkbtn" onClick={() => setOpen('privacy')}>Privacy</button>
        {' · '}
        <button type="button" className="linkbtn" onClick={() => setOpen('terms')}>Terms</button>
      </p>
      {open && (
        <div className="notice" style={{ marginTop: 10 }}>
          <strong>{open === 'privacy' ? 'Privacy' : 'Terms'}</strong>
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="helper" style={{ marginTop: 8 }}>{paragraph}</p>
          ))}
          <button type="button" className="btn secondary" style={{ marginTop: 10 }} onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
