import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { authApi, setAccessToken, type MeResponse } from '../services/api';
import './BusinessSwitcher.css';

// Sidebar business selector. Shows the active business; switching mints a new access token (with the
// new `bid` claim) and reloads so the whole app re-scopes to the selected business.
export function BusinessSwitcher({ collapsed }: { collapsed?: boolean }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authApi.me().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!me) return null;
  const active = me.businesses.find(b => b.id === me.activeBusinessId) || me.businesses[0];
  const canSwitch = me.businesses.length > 1;

  const switchTo = async (businessId: string) => {
    if (businessId === active?.id) return setOpen(false);
    setSwitching(true);
    try {
      const { accessToken } = await authApi.switchBusiness(businessId);
      setAccessToken(accessToken);
      window.location.assign('/'); // re-bootstrap under the new business
    } catch {
      setSwitching(false);
      setOpen(false);
    }
  };

  if (collapsed) {
    return (
      <div className="biz-switch biz-switch--collapsed" title={active?.name}>
        <Building2 size={20} />
      </div>
    );
  }

  const initial = (active?.name?.trim()?.[0] ?? 'W').toUpperCase();

  return (
    <div className="biz-switch" ref={ref}>
      <button
        className="biz-switch__trigger"
        onClick={() => canSwitch && setOpen(o => !o)}
        disabled={switching || !canSwitch}
        title={active?.name}
      >
        <span className="biz-switch__avatar" aria-hidden="true">{initial}</span>
        <span className="biz-switch__text">
          <span className="biz-switch__label">Workspace</span>
          <span className="biz-switch__name">{active?.name ?? 'Workspace'}</span>
        </span>
        {canSwitch && <ChevronsUpDown size={15} className="biz-switch__chev" />}
      </button>
      {open && (
        <div className="biz-switch__menu">
          {me.businesses.map(b => (
            <button key={b.id} className="biz-switch__item" onClick={() => switchTo(b.id)}>
              <span>{b.name}</span>
              {b.id === active?.id && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
