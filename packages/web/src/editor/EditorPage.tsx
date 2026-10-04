import type {
  AutomationDetail,
  CapabilitiesResponse,
  DefinitionSchema,
  ValidationIssue,
} from '@comment-automations/api-schema';
import type { AutomationId, VersionId } from '@comment-automations/shared';
import { automationId, capabilities, versionId } from '@comment-automations/shared';
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { AnalyticsTab } from '../analytics/AnalyticsTab.js';
import type { Version } from '../api/client.js';
import { api, ApiError } from '../api/client.js';
import { capabilitiesFor, deriveCapabilities } from '../capabilities.js';
import { listWords, plural } from '../format.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { RunsTab } from '../runs/RunsTab.js';
import type { ToastMessage } from '../ui.js';
import {
  Button,
  Callout,
  Modal,
  Pill,
  PlatformBadge,
  platformLabel,
  Skeleton,
  Toast,
} from '../ui.js';
import { useAsync } from '../useAsync.js';
import { WikiModal } from '../wiki/WikiModal.js';
import { StepsCard } from './StepsCard.js';
import { TriggerCard } from './TriggerCard.js';
import { inProgressByVersion, VersionsWindow } from './VersionsWindow.js';

type Tab = 'editor' | 'runs' | 'analytics';

type Dialog =
  | { kind: 'publish' }
  | { kind: 'moveToDraft' }
  | { kind: 'archive' }
  | { kind: 'versions' }
  | { kind: 'wiki' }
  | { kind: 'makeActive'; version: Version };

const emptyDefinition: DefinitionSchema = {
  trigger: {
    comments: { posts: { kind: 'any' }, keywords: [] },
    onRepeatWhileWaiting: 'supersede',
  },
  steps: [],
};

const allowedTriggersOnly = (
  definition: DefinitionSchema,
  allowed: CapabilitiesResponse['allowedTriggers'],
): DefinitionSchema => ({
  ...definition,
  trigger: {
    ...definition.trigger,
    comments: allowed.comments ? definition.trigger.comments : undefined,
    messages: allowed.messages ? definition.trigger.messages : undefined,
  },
});

const StatePill = ({ state }: { state: AutomationDetail['state'] }) =>
  state === 'live' ? (
    <Pill tone="ok">Live</Pill>
  ) : state === 'archived' ? (
    <Pill tone="warn">Archived</Pill>
  ) : (
    <Pill>Draft</Pill>
  );

const publishSummary = (definition: DefinitionSchema, handle: string): string => {
  const keywords =
    definition.trigger.comments?.keywords ?? definition.trigger.messages?.keywords ?? [];
  const what =
    definition.trigger.comments !== undefined && definition.trigger.messages !== undefined
      ? 'comments and messages'
      : definition.trigger.messages !== undefined
        ? 'messages'
        : 'comments';
  const where =
    definition.trigger.comments?.posts.kind === 'specific'
      ? `on the chosen post of ${handle}`
      : definition.trigger.comments !== undefined
        ? `on any post of ${handle}`
        : `to ${handle}`;
  const contain =
    keywords.length === 0 ? '' : ` that contain ${listWords(keywords.map((word) => `“${word}”`))}`;
  return `It will start answering ${what} ${where}${contain}.`;
};

const useEditorState = (
  id: AutomationId,
  viewingVersion: VersionId | null,
  caps: CapabilitiesResponse | null,
  detail: ReturnType<typeof useAsync<AutomationDetail>>,
  versions: ReturnType<typeof useAsync<Version[]>>,
) => {
  const [definition, setDefinition] = useState<DefinitionSchema | null>(null);
  const [saved, setSaved] = useState('');
  const [materializing, setMaterializing] = useState(false);

  useEffect(() => {
    setDefinition(null);
  }, [id, viewingVersion]);

  useEffect(() => {
    if (
      definition !== null ||
      caps === null ||
      detail.data === undefined ||
      versions.data === undefined
    ) {
      return;
    }
    if (viewingVersion !== null) {
      const version = versions.data.find((item) => item.id === viewingVersion);
      setDefinition(version?.definition ?? emptyDefinition);
      return;
    }
    const edit = (loaded: DefinitionSchema) => {
      setDefinition(allowedTriggersOnly(loaded, caps.allowedTriggers));
      setSaved(JSON.stringify(loaded));
    };
    if (detail.data.draft !== null) {
      edit(detail.data.draft);
      return;
    }
    const active = versions.data.find((item) => item.isActive);
    if (active === undefined) {
      edit(emptyDefinition);
      return;
    }
    if (active.definition !== undefined) {
      edit(active.definition);
      return;
    }
    if (materializing) {
      return;
    }
    setMaterializing(true);
    api.draftFromVersion(id, active.id).then(
      (result) => {
        detail.setData(result);
        edit(result.draft ?? emptyDefinition);
        setMaterializing(false);
      },
      () => {
        setDefinition(emptyDefinition);
        setMaterializing(false);
      },
    );
  }, [definition, caps, detail, versions, viewingVersion, id, materializing]);

  const dirty =
    definition !== null && viewingVersion === null && JSON.stringify(definition) !== saved;
  return { definition, setDefinition, saved, setSaved, dirty };
};

export const EditorPage = ({ tab }: { tab: Tab }) => {
  const params = useParams();
  const id = automationId(params.id ?? '');
  const viewingVersion = params.versionId === undefined ? null : versionId(params.versionId);
  const navigate = useNavigate();

  const detail = useAsync(() => api.automation(id), [id]);
  const versions = useAsync(() => api.versions(id), [id]);
  const accounts = useAsync(() => api.accounts(), []);
  const inProgressRuns = useAsync(
    () => api.runs(id, { status: ['running', 'waiting'], limit: 200 }),
    [id],
  );
  const account = accounts.data?.find((item) => item.id === detail.data?.accountId);
  const caps: CapabilitiesResponse | null =
    detail.data === undefined || accounts.data === undefined
      ? null
      : account === undefined
        ? deriveCapabilities(capabilities[detail.data.platform])
        : capabilitiesFor(account);
  const { definition, setDefinition, setSaved, dirty } = useEditorState(
    id,
    viewingVersion,
    caps,
    detail,
    versions,
  );
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const clearToast = useCallback(() => setToast(null), []);

  const blocker = useBlocker(
    ({ nextLocation }) => dirty && !nextLocation.pathname.startsWith(`/automations/${id}`),
  );

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (detail.status === 'error') {
    return (
      <Callout tone="bad" title="Couldn’t load the automation">
        {detail.error.message}{' '}
        <Link to="/" style={{ color: 'inherit' }}>
          Back to DM automations
        </Link>
      </Callout>
    );
  }
  if (
    viewingVersion !== null &&
    versions.data !== undefined &&
    !versions.data.some((item) => item.id === viewingVersion)
  ) {
    return <NotFoundPage />;
  }
  if (detail.data === undefined || definition === null || caps === null) {
    return <Skeleton rows={5} />;
  }

  const automation = detail.data;
  const versionList: Version[] = versions.data ?? automation.versions;
  const handle = account?.handle ?? platformLabel(automation.platform);
  const viewed =
    viewingVersion === null
      ? null
      : (versionList.find((item) => item.id === viewingVersion) ?? null);
  const readOnly = viewingVersion !== null;
  const archived = automation.state === 'archived';
  const locked = readOnly || archived;
  const active = versionList.find((item) => item.isActive) ?? null;
  const nextNumber = versionList.reduce((max, item) => Math.max(max, item.number), 0) + 1;
  const hasMessageStep = definition.steps.some((step) => step.kind === 'send_message');
  const inProgress = inProgressByVersion(inProgressRuns.data?.runs ?? []);
  const inProgressCount = inProgressRuns.data?.runs.length ?? 0;
  const activeInProgress = active === null ? 0 : (inProgress.get(active.number) ?? 0);
  const keywords =
    definition.trigger.comments?.keywords ?? definition.trigger.messages?.keywords ?? [];

  const refresh = () => {
    detail.reload();
    versions.reload();
    inProgressRuns.reload();
  };

  const failToast = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 422) {
      setIssues(failure.issues);
      setToast({ tone: 'bad', text: 'Fix the highlighted fields and try again.' });
    } else if (failure instanceof ApiError) {
      setToast({ tone: 'bad', text: failure.message });
    } else {
      setToast({ tone: 'bad', text: 'Couldn’t save. Check your connection and try again.' });
    }
  };

  const saveDraft = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await api.saveDraft(id, definition);
      detail.setData(result);
      setSaved(JSON.stringify(definition));
      setIssues([]);
      return true;
    } catch (failure) {
      failToast(failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (await saveDraft()) {
      setToast({ tone: 'ok', text: 'Draft saved' });
    }
  };

  const publish = async () => {
    setDialog(null);
    if (!(await saveDraft())) {
      return;
    }
    setBusy(true);
    try {
      const result = await api.publish(id, note.trim());
      setNote('');
      setToast({ tone: 'ok', text: `✓ Published as version ${result.version.number}.` });
      refresh();
    } catch (failure) {
      failToast(failure);
    } finally {
      setBusy(false);
    }
  };

  const moveToDraft = async () => {
    setDialog(null);
    setBusy(true);
    try {
      detail.setData(await api.pause(id));
      setToast({ tone: 'ok', text: 'Moved to draft. New comments and messages are not answered.' });
    } catch (failure) {
      failToast(failure);
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    setDialog(null);
    setBusy(true);
    try {
      await api.archive(id);
      flushSync(() => setSaved(JSON.stringify(definition)));
      navigate('/', { state: { toast: { tone: 'ok', text: `Archived ${automation.name}` } } });
    } catch (failure) {
      failToast(failure);
    } finally {
      setBusy(false);
    }
  };

  const makeActive = async (version: Version) => {
    setDialog(null);
    setBusy(true);
    try {
      await api.activate(id, version.id);
      const newest = versionList.reduce((max, item) => Math.max(max, item.number), 0);
      setToast({
        tone: 'ok',
        text:
          newest > version.number
            ? `✓ Version ${version.number} is active. Version ${newest} is kept.`
            : `✓ Version ${version.number} is active.`,
      });
      refresh();
      if (viewingVersion !== null) {
        navigate(`/automations/${id}`);
      }
    } catch (failure) {
      failToast(failure);
    } finally {
      setBusy(false);
    }
  };

  const editAsNew = async (version: Version) => {
    setDialog(null);
    setBusy(true);
    try {
      const result = await api.draftFromVersion(id, version.id);
      detail.setData(result);
      const draft = result.draft ?? emptyDefinition;
      setDefinition(draft);
      setSaved(JSON.stringify(draft));
      setIssues([]);
      navigate(`/automations/${id}`);
    } catch (failure) {
      failToast(failure);
    } finally {
      setBusy(false);
    }
  };

  const actions = locked ? (
    <>
      <Button kind="ghost" onClick={() => setDialog({ kind: 'versions' })}>
        Versions
      </Button>
      {viewed === null || archived ? null : (
        <Button kind="sec" disabled={busy} onClick={() => editAsNew(viewed)}>
          Edit as a new version
        </Button>
      )}
      {viewed === null || archived || viewed.isActive ? null : (
        <Button disabled={busy} onClick={() => setDialog({ kind: 'makeActive', version: viewed })}>
          Make active
        </Button>
      )}
    </>
  ) : automation.state === 'live' ? (
    <>
      <Button kind="ghost" disabled={busy} onClick={() => setDialog({ kind: 'archive' })}>
        Archive
      </Button>
      <Button kind="ghost" disabled={busy} onClick={() => setDialog({ kind: 'moveToDraft' })}>
        Move to draft
      </Button>
      <Button kind="sec" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
      <Button disabled={busy} onClick={() => setDialog({ kind: 'publish' })}>
        Save and publish
      </Button>
    </>
  ) : (
    <>
      <Button kind="ghost" disabled={busy} onClick={() => setDialog({ kind: 'archive' })}>
        Archive
      </Button>
      <Button kind="sec" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save draft'}
      </Button>
      <Button disabled={busy} onClick={() => setDialog({ kind: 'publish' })}>
        Publish
      </Button>
    </>
  );

  return (
    <>
      <div className="crumbs">
        <Link to="/">DM automations</Link> / {automation.name}
      </div>
      <div className="ph">
        <div>
          <div className="row">
            <h1 style={{ fontSize: 26 }}>{automation.name}</h1>
            <StatePill state={automation.state} />
          </div>
          <div className="sub">
            <PlatformBadge platform={automation.platform} text={handle} />
          </div>
        </div>
        <div className="row">{actions}</div>
      </div>
      <div className="tabs">
        {(
          [
            ['editor', 'Editor', `/automations/${id}`],
            ['runs', 'Runs', `/automations/${id}/runs`],
            ['analytics', 'Analytics', `/automations/${id}/analytics`],
          ] as const
        ).map(([key, label, to]) => (
          <span key={key} className={tab === key && !readOnly ? 'on' : ''}>
            <Link to={to} style={{ color: 'inherit', textDecoration: 'none' }}>
              {label}
            </Link>
          </span>
        ))}
      </div>
      <div className="subrow">
        <span className="wikilink book" onClick={() => setDialog({ kind: 'wiki' })}>
          {platformLabel(automation.platform)} automations wiki
        </span>
        <span className="wikilink" onClick={() => setDialog({ kind: 'versions' })}>
          {active === null
            ? 'Not published yet'
            : `Version ${active.number} is active · all versions`}
        </span>
      </div>

      {tab === 'runs' && !readOnly ? (
        <RunsTab
          automation={automation}
          versions={versionList}
          keywords={keywords}
          handle={handle}
          onOpenWiki={() => setDialog({ kind: 'wiki' })}
        />
      ) : tab === 'analytics' && !readOnly ? (
        <AnalyticsTab
          automation={automation}
          versions={versionList}
          hasMessageStep={hasMessageStep}
        />
      ) : (
        <>
          {readOnly && viewed !== null ? (
            <div className="vbanner">
              <span>
                <b>You are viewing version {viewed.number}.</b>{' '}
                {archived
                  ? 'The automation is archived; nothing here is editable.'
                  : viewed.isActive
                    ? 'It is the active version. Nothing here is editable; edit it as a new version to change it.'
                    : `The active version is ${active === null ? 'none' : active.number}. Nothing here is editable until you make it active or edit it as a new version.`}
                {viewed.definition === undefined
                  ? ' The steps of this version are not available from the API yet.'
                  : ''}
              </span>
              <span className="spacer" />
              <Button kind="sec" small onClick={() => navigate(`/automations/${id}`)}>
                Back to the editor
              </Button>
            </div>
          ) : null}
          {!readOnly && automation.state === 'live' ? (
            <Callout tone="info" title="This automation is live" className="outage">
              Changes apply to new runs after you save and publish. Runs already in progress finish
              with the version they started on.
            </Callout>
          ) : null}
          <TriggerCard
            trigger={definition.trigger}
            caps={caps}
            accountId={automation.accountId}
            issues={issues}
            readOnly={locked}
            onChange={(trigger) => setDefinition({ ...definition, trigger })}
          />
          <StepsCard
            steps={definition.steps}
            trigger={definition.trigger}
            caps={caps}
            issues={issues}
            readOnly={locked}
            onChange={(steps) => setDefinition({ ...definition, steps })}
          />
        </>
      )}

      {dialog?.kind === 'wiki' ? (
        <WikiModal platform={automation.platform} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'versions' ? (
        <VersionsWindow
          name={automation.name}
          versions={versionList}
          hasDraft={automation.draft !== null || dirty}
          inProgress={inProgress}
          readOnly={archived}
          onClose={() => setDialog(null)}
          onView={(version) => {
            setDialog(null);
            navigate(`/automations/${id}/versions/${version.id}`);
          }}
          onMakeActive={(version) => setDialog({ kind: 'makeActive', version })}
          onEditAsNew={editAsNew}
        />
      ) : null}
      {dialog?.kind === 'makeActive' ? (
        <Modal
          title={`Make version ${dialog.version.number} active?`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button kind="sec" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button onClick={() => makeActive(dialog.version)}>
                Make version {dialog.version.number} active
              </Button>
            </>
          }
        >
          <p>
            New comments and messages will run version {dialog.version.number}.
            {active === null
              ? ''
              : ` Version ${active.number} stays in the history and can be made active again at any time.`}
            {active !== null && activeInProgress > 0
              ? ` ${plural(activeInProgress, 'run')} in progress on version ${active.number} will finish on version ${active.number}.`
              : ''}
          </p>
          <p>
            If you edit version {dialog.version.number} afterwards and publish, it is saved as
            version {nextNumber}.
          </p>
        </Modal>
      ) : null}
      {dialog?.kind === 'publish' ? (
        <Modal
          title={
            active === null ? `Publish "${automation.name}"?` : `Publish as version ${nextNumber}?`
          }
          text={
            active === null
              ? publishSummary(definition, handle)
              : `Version ${active.number} stays in the history unchanged. ${
                  activeInProgress > 0
                    ? `${plural(activeInProgress, 'run')} in progress on version ${active.number} will finish on it; new`
                    : 'New'
                } comments and messages run version ${nextNumber}.`
          }
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button kind="sec" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={publish}>
                {active === null ? 'Publish' : `Publish version ${nextNumber}`}
              </Button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="publish-note">What changed</label>
            <input
              id="publish-note"
              className="input"
              placeholder={active === null ? 'First published' : 'Shorter pricing message'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Callout tone="info">
            Test it from another account: your own{' '}
            {caps.allowedTriggers.comments ? 'comments' : 'messages'} never trigger an automation.
          </Callout>
        </Modal>
      ) : null}
      {dialog?.kind === 'moveToDraft' ? (
        <Modal
          title="Move to draft?"
          text={`It stops answering new comments and messages.${
            inProgressCount === 0
              ? ''
              : ` ${plural(inProgressCount, 'run')} already in progress will finish.`
          }`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button kind="sec" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button onClick={moveToDraft}>Move to draft</Button>
            </>
          }
        />
      ) : null}
      {dialog?.kind === 'archive' ? (
        <Modal
          title={`Archive "${automation.name}"?`}
          text={`It disappears from the list and stops for good${
            inProgressCount === 0 ? '' : `; ${plural(inProgressCount, 'run')} in progress will stop`
          }. Its runs and analytics stay readable.`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button kind="sec" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button kind="danger" onClick={archive}>
                Archive
              </Button>
            </>
          }
        />
      ) : null}
      {blocker.state === 'blocked' ? (
        <Modal
          title="Leave without saving?"
          text={`Your changes to "${automation.name}" will be lost.`}
          onClose={() => blocker.reset()}
          footer={
            <>
              <Button kind="sec" onClick={() => blocker.reset()}>
                Keep editing
              </Button>
              <Button kind="danger" onClick={() => blocker.proceed()}>
                Leave
              </Button>
            </>
          }
        />
      ) : null}
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
};
