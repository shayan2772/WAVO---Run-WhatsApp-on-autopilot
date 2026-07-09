import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Trash2, ArrowLeft, Loader2, Users, Megaphone, FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PhoneInput } from '../components/PhoneInput';
import { formatPhoneDisplay } from '../utils/phone';
import { useToast } from '../components/Toast';
import { audienceApi, type ContactList, type AudienceContact } from '../services/api';
import './Marketing.css';

export function Audiences() {
  const navigate = useNavigate();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContactList | null>(null);
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState('');
  const [cname, setCname] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmList, setConfirmList] = useState<ContactList | null>(null);
  const [deletingList, setDeletingList] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const loadLists = () => {
    setLoading(true);
    audienceApi
      .list()
      .then(setLists)
      .catch(() => showErrorToast('Failed to load audiences'))
      .finally(() => setLoading(false));
  };
  useEffect(loadLists, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openList = (l: ContactList) => {
    setSelected(l);
    audienceApi.contacts(l.id).then(setContacts).catch(() => setContacts([]));
  };

  const create = async () => {
    if (!newName.trim()) {
      // Don't silently no-op — tell the user a name is required and focus the field.
      showErrorToast('Enter an audience name first');
      nameRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      const created = await audienceApi.create(newName.trim());
      setNewName('');
      // Optimistically show it immediately, then reconcile with the server list.
      setLists(prev => [created, ...prev.filter(l => l.id !== created.id)]);
      loadLists();
      showSuccessToast('Audience created', created.name);
      // Jump straight into the new list so the user can add/import contacts.
      openList(created);
    } catch (e) {
      showErrorToast('Could not create audience', e instanceof Error ? e.message : undefined);
    } finally {
      setCreating(false);
    }
  };

  const addContact = async () => {
    if (!selected || !phone.trim()) return;
    setAdding(true);
    try {
      await audienceApi.addContact(selected.id, { phone: phone.trim(), name: cname.trim() || undefined });
      setPhone('');
      setCname('');
      openList(selected);
      showSuccessToast('Contact added');
    } catch {
      showErrorToast('Could not add contact (check the phone number)');
    } finally {
      setAdding(false);
    }
  };

  const deleteList = async () => {
    if (!confirmList) return;
    setDeletingList(true);
    try {
      await audienceApi.remove(confirmList.id);
      setLists(prev => prev.filter(l => l.id !== confirmList.id));
      showSuccessToast('Audience deleted');
      setConfirmList(null);
    } catch (e) {
      showErrorToast('Could not delete audience', e instanceof Error ? e.message : undefined);
    } finally {
      setDeletingList(false);
    }
  };

  const markDnd = async (c: AudienceContact) => {
    if (!selected) return;
    try {
      await audienceApi.optOut(c.id);
      showSuccessToast('Marked Do-Not-Disturb', 'This contact will be skipped by all campaigns.');
      openList(selected);
    } catch (e) {
      showErrorToast('Could not update contact', e instanceof Error ? e.message : undefined);
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setImporting(true);
    try {
      const r = await audienceApi.importCsv(selected.id, file);
      showSuccessToast(`Imported ${r.imported}, merged ${r.duplicatesMerged}, invalid ${r.invalid}`);
      openList(selected);
    } catch {
      showErrorToast('CSV import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (selected) {
    return (
      <div className="page">
        <button className="mkt-back" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} /> All audiences
        </button>
        <PageHeader
          title={selected.name}
          subtitle={`${contacts.length} contacts`}
          actions={
            <Button
              variant="primary"
              icon={<Megaphone size={16} />}
              onClick={() => navigate('/campaigns')}
              disabled={contacts.length === 0}
            >
              Create campaign
            </Button>
          }
        />
        <div className="mkt-toolbar">
          <PhoneInput value={phone} onChange={setPhone} placeholder="Phone number" />
          <input placeholder="Name (optional)" value={cname} onChange={e => setCname(e.target.value)} />
          <Button icon={<Plus size={16} />} loading={adding} onClick={addContact}>
            Add
          </Button>
          <Button icon={<Upload size={16} />} loading={importing} onClick={() => fileRef.current?.click()}>
            Import CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={onImport} />
        </div>
        <table className="mkt-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id}>
                <td>{c.name || '—'}</td>
                <td className="mono-num">{formatPhoneDisplay(c.phone)}</td>
                <td>
                  {c.optedOut ? (
                    <span className="mkt-tag mkt-tag--red" title="Opted out — campaigns skip this contact">
                      🚫 DND · opted out
                    </span>
                  ) : (
                    <span className="mkt-tag">subscribed</span>
                  )}
                </td>
                <td>
                  {!c.optedOut && (
                    <button className="mkt-inline-link" onClick={() => markDnd(c)} title="Stop sending to this contact">
                      Mark DND
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={4} className="mkt-empty">No contacts yet — add one or import a CSV (header: phone,name,…).</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const createRow = (
    <div className="mkt-toolbar">
      <input
        ref={nameRef}
        placeholder="New audience name (e.g. Job Fair Leads)"
        value={newName}
        onChange={e => setNewName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && create()}
      />
      <Button variant="primary" icon={<Plus size={16} />} loading={creating} onClick={create}>
        Create audience
      </Button>
    </div>
  );

  return (
    <div className="page">
      <PageHeader title="Audiences" subtitle="Contact lists for your campaigns" />

      <ConfirmDialog
        open={!!confirmList}
        title="Delete audience"
        message={
          <p style={{ margin: 0 }}>
            Delete <strong>{confirmList?.name}</strong> and its {confirmList?.contactCount ?? 0} contacts? This can't be undone.
          </p>
        }
        loading={deletingList}
        onConfirm={deleteList}
        onCancel={() => setConfirmList(null)}
      />

      {loading ? (
        <div className="mkt-loading"><Loader2 className="animate-spin" size={28} /></div>
      ) : lists.length === 0 ? (
        // Featured "how to create an audience" guide + the create field, when there are none yet.
        <div className="aud-guide">
          <div className="aud-guide__head">
            <span className="aud-guide__icon"><Users size={26} /></span>
            <div>
              <h3>Create your first audience</h3>
              <p>An audience is a contact list you send campaigns to. Name it, add or import contacts, then target it from the Campaigns page.</p>
            </div>
          </div>

          <ol className="aud-guide__steps">
            <li>
              <span className="aud-guide__num">1</span>
              <div><strong>Name your audience</strong><p>Give it a clear name like "Newsletter" or "Job Fair Leads".</p></div>
            </li>
            <li>
              <span className="aud-guide__num">2</span>
              <div><strong>Add contacts</strong><p>Add numbers one-by-one, or <FileSpreadsheet size={13} style={{ verticalAlign: '-2px' }} /> import a CSV with a <code>phone</code> column (and optional <code>name</code>).</p></div>
            </li>
            <li>
              <span className="aud-guide__num">3</span>
              <div><strong>Send a campaign</strong><p>Pick this audience when creating a campaign to reach everyone on it — safely paced.</p></div>
            </li>
          </ol>

          <div className="aud-guide__create">
            <label>Audience name</label>
            {createRow}
            <p className="mkt-hint">Tip: press Enter to create. You can rename or delete it anytime.</p>
          </div>
        </div>
      ) : (
        <>
          {createRow}
          <div className="mkt-grid">
            {lists.map(l => (
              <div key={l.id} className="mkt-card" onClick={() => openList(l)}>
                <div className="mkt-card__title">{l.name}</div>
                <div className="mkt-card__meta">{l.contactCount} contacts</div>
                <button
                  className="mkt-card__del"
                  onClick={e => {
                    e.stopPropagation();
                    setConfirmList(l);
                  }}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
