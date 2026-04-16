import { useState } from 'react';
import { getApiToken, setApiToken, hasApiToken } from '@/lib/api-client';
import { KeyRound, X } from 'lucide-react';
import { toast } from '@/store/toast-store';

export function AuthButton() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const authenticated = hasApiToken();

  const handleSave = () => {
    const trimmed = token.trim();
    if (trimmed) {
      setApiToken(trimmed);
      toast.success('API token saved');
    } else {
      setApiToken(null);
      toast.info('API token cleared');
    }
    setToken('');
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-white/5 transition-colors"
        onClick={() => {
          setToken(getApiToken() ?? '');
          setOpen(true);
        }}
        title="API Token"
      >
        <KeyRound size={12} className={authenticated ? 'text-green' : 'text-text-dim'} />
        <span className="text-text-dim">{authenticated ? 'Token set' : 'Set token'}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="bg-surface border border-border rounded-lg p-5 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm">API Token</h3>
              <button type="button" className="text-text-dim hover:text-text" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-text-dim mb-3">
              Token is stored in localStorage and sent as Bearer auth header. Leave empty to clear.
            </p>
            <input
              type="password"
              className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text placeholder-gray-500 focus:outline-none focus:border-accent mb-3"
              placeholder="Bearer token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded text-text-dim hover:text-text hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80"
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
