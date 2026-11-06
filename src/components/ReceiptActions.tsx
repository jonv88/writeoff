import { useRef } from 'react';

const hiddenInput = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none' as const,
};

export function isReceiptFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type.startsWith('image/')
    || file.type === 'application/pdf'
    || /\.(jpe?g|png|webp|gif|hei[cf]|pdf|bmp)$/.test(name);
}

export function isCsvFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
}

export function ReceiptActions({
  onReceipt,
  onOtherFile,
}: {
  onReceipt: (file: File) => void;
  onOtherFile?: (file: File) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null, kind: 'receipt' | 'any') => {
    const chosen = list?.[0];
    if (!chosen) return;
    if (kind === 'receipt' || isReceiptFile(chosen)) onReceipt(chosen);
    else onOtherFile?.(chosen);
  };

  return (
    <div>
      <div className="inlinebuttons" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => camera.current?.click()}>
          Take photo
        </button>
        <button type="button" className="btn secondary" onClick={() => library.current?.click()}>
          Choose photos or screenshots
        </button>
        <button type="button" className="btn secondary" onClick={() => file.current?.click()}>
          Choose file
        </button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        style={hiddenInput}
        aria-label="Take photo"
        onChange={(e) => {
          take(e.target.files, 'receipt');
          e.target.value = '';
        }}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        style={hiddenInput}
        aria-label="Choose photos or screenshots"
        onChange={(e) => {
          take(e.target.files, 'receipt');
          e.target.value = '';
        }}
      />
      <input
        ref={file}
        type="file"
        accept="image/*,application/pdf,.csv,text/csv,.heic,.heif"
        style={hiddenInput}
        aria-label="Choose file"
        onChange={(e) => {
          take(e.target.files, 'any');
          e.target.value = '';
        }}
      />
    </div>
  );
}
