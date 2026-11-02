import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Industry, ProfileMode, WorkType } from '../../lib/types';

export function SetupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, updateProfile } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<ProfileMode>(profile.mode);
  const [name, setName] = useState(profile.name);
  const [worktype, setWorktype] = useState<WorkType>(profile.worktype);
  const [industry, setIndustry] = useState<Industry>(profile.industry);
  const [country, setCountry] = useState(profile.country);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setMode(profile.mode);
      setName(profile.name);
      setWorktype(profile.worktype);
      setIndustry(profile.industry);
      setCountry(profile.country);
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, profile]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await updateProfile({
      mode,
      name: name.trim(),
      worktype,
      industry,
      country,
      complete: true,
    });
    onClose();
  }

  return (
    <dialog
      id="setupdialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form id="setupform" onSubmit={onSubmit}>
        <div className="panelhead">
          <h2>Make it work for you.</h2>
          <button className="edit" type="button" onClick={onClose} aria-label="Close setup">
            ✕
          </button>
        </div>
        <p>Just the basics. Change these anytime.</p>
        <label>What are you tracking?</label>
        <div className="setupchoices">
          {(['Both', 'Business', 'Personal'] as ProfileMode[]).map((value) => (
            <label key={value}>
              <input
                name="mode"
                type="radio"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />{' '}
              {value}
            </label>
          ))}
        </div>
        <div className="row">
          <label>
            Name or business
            <input
              id="profilename"
              maxLength={100}
              placeholder="Your workspace"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Work arrangement
            <select
              id="worktype"
              value={worktype}
              onChange={(e) => setWorktype(e.target.value as WorkType)}
            >
              <option value="self">Self-employed / business owner</option>
              <option value="employee">Employee (W-2)</option>
              <option value="mixed">Both</option>
              <option value="personal">Personal only</option>
            </select>
          </label>
        </div>
        <label>
          What kind of work do you do?
          <select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value as Industry)}
          >
            <option value="general">General / other</option>
            <option value="creative">Acting, film & creative work</option>
            <option value="consulting">Consulting & professional services</option>
            <option value="retail">Retail & online selling</option>
            <option value="trades">Trades & field services</option>
          </select>
        </label>
        <label>
          Tax country
          <select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="US">United States</option>
            <option value="other">Another country</option>
          </select>
        </label>
        <div className="notice">
          Suggestions organize possible tax records. They do not calculate tax savings or determine
          whether an expense qualifies.
        </div>
        <div className="dialogactions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Later
          </button>
          <button className="btn" type="submit">
            Save setup
          </button>
        </div>
      </form>
    </dialog>
  );
}
