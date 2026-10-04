import type { AutomationDetail } from '@comment-automations/api-schema';
import type { AccountId } from '@comment-automations/shared';
import { useState } from 'react';
import type { Account } from '../api/client.js';
import { api } from '../api/client.js';
import { capabilitiesFor, supportsAutomations, unsupportedReason } from '../capabilities.js';
import { Button, Callout, Modal, PlatformBadge, platformLabel } from '../ui.js';

export const NewAutomationModal = ({
  accounts,
  initialAccountId,
  onClose,
  onCreated,
}: {
  accounts: Account[];
  initialAccountId?: AccountId;
  onClose: () => void;
  onCreated: (automation: AutomationDetail) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(
    accounts.find((item) => item.id === initialAccountId) ?? null,
  );
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = accounts.filter((item) => supportsAutomations(capabilitiesFor(item)));
  const disconnected = account?.status === 'disconnected';
  const canCreate = account !== null && !disconnected && name.trim() !== '' && !saving;

  const create = async () => {
    if (account === null) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createAutomation({ accountId: account.id, name: name.trim() }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Couldn’t create the automation.');
      setSaving(false);
    }
  };

  if (supported.length === 0) {
    return (
      <Modal
        title="New automation"
        text="Name it and choose the account it runs on. The account can’t be changed later."
        onClose={onClose}
        footer={
          <>
            <Button kind="sec" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>Go to Accounts</Button>
          </>
        }
      >
        <Callout tone="info" title="Connect an account first">
          Automations run on Instagram, Facebook Pages, Threads, X, Bluesky, YouTube, LinkedIn
          Pages, WhatsApp Business and TikTok Business accounts. None is connected yet.
        </Callout>
      </Modal>
    );
  }

  return (
    <Modal
      title="New automation"
      text="Name it and choose the account it runs on. The account can’t be changed later."
      onClose={onClose}
      footer={
        <>
          <Button kind="sec" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canCreate} onClick={create}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Account</label>
        <div
          className={open ? 'select open' : 'select'}
          role="button"
          onClick={() => setOpen((value) => !value)}
        >
          {account === null ? (
            'Select a connected account'
          ) : (
            <PlatformBadge platform={account.platform} text={account.handle} />
          )}
          <span>▾</span>
        </div>
        {open ? (
          <div className="opts">
            {accounts.map((item) => {
              const usable = supportsAutomations(capabilitiesFor(item));
              return (
                <div
                  key={item.id}
                  className={usable ? '' : 'dis'}
                  onClick={() => {
                    if (usable) {
                      setAccount(item);
                      setOpen(false);
                    }
                  }}
                >
                  <PlatformBadge platform={item.platform} text={item.handle} />
                  <small>{usable ? platformLabel(item.platform) : unsupportedReason(item)}</small>
                </div>
              );
            })}
          </div>
        ) : null}
        {disconnected ? (
          <div className="errtext">
            This account is disconnected. Reconnect it on the Accounts page before creating an
            automation.
          </div>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="new-automation-name">Name</label>
        <input
          id="new-automation-name"
          className="input"
          value={name}
          placeholder="Pricing lead capture"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {error === null ? null : <div className="errtext">{error}</div>}
    </Modal>
  );
};
