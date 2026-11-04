import { useWorkspace } from '../context/WorkspaceContext';

export function Toast() {
  const { toast, toastUndo, clearToast } = useWorkspace();
  if (!toast) return null;
  return (
    <div className="toast" id="toast" role="status" style={{ display: 'block' }}>
      {toast}
      {toastUndo && (
        <button
          type="button"
          className="undo"
          onClick={() => {
            toastUndo();
            clearToast();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
