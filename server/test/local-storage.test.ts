import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import {
  clearRecord,
  loadRecord,
  localSaveStatus,
  saveRecord,
  type LocalSaveState,
  type StoreSpec
} from '../../src/core/storage/localStore';

function fixture(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map<string, string>();
  const blocked = new Set<string>();
  const keys = new Set<string>();
  let denied = false;
  let readsDenied = false;
  const storage = {
    getItem: (key: string) => {
      if (readsDenied) throw new DOMException('Read blocked', 'SecurityError');
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked.has(key)) throw new DOMException('Storage full', 'QuotaExceededError');
      values.set(key, value);
    },
    removeItem: (key: string) => values.delete(key)
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get localStorage() {
        if (denied) throw new DOMException('Storage blocked', 'SecurityError');
        return storage;
      }
    }
  });
  const spec = (key: string): StoreSpec<unknown> => {
    keys.add(key);
    return {
      key,
      version: 1,
      create: () => ({}),
      migrate: (data) => data,
      validate: (data) => data
    };
  };
  t.after(() => {
    for (const key of keys) clearRecord(spec(key));
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return {
    values,
    blocked,
    spec,
    deny: (value: boolean) => {
      denied = value;
    },
    denyReads: (value: boolean) => {
      readsDenied = value;
    }
  };
}

it('blocked storage keeps the latest record in memory for a persistence-only retry', (t) => {
  const { spec, deny } = fixture(t);
  const profile = spec('test.profile');
  const changes: LocalSaveState[] = [];
  const unsubscribe = localSaveStatus.subscribe(() => changes.push(localSaveStatus.getSnapshot()));
  t.after(unsubscribe);
  deny(true);
  assert.equal(saveRecord(profile, { xp: 10 }), false);
  assert.equal(saveRecord(profile, { xp: 20 }), false);
  assert.equal(localSaveStatus.retry(), false);
  assert.equal(localSaveStatus.getSnapshot(), 'unsaved');
  deny(false);
  assert.equal(localSaveStatus.retry(), true);
  assert.deepEqual(loadRecord(profile).value, { xp: 20 });
  assert.deepEqual(changes, ['unsaved', 'saved']);
});

it('an unrelated successful write cannot hide unsaved progress; a normal latest write can recover it', (t) => {
  const { spec, blocked, values } = fixture(t);
  const profile = spec('test.profile');
  const settings = spec('test.settings');
  blocked.add(profile.key);
  assert.equal(saveRecord(profile, { xp: 10 }), false);
  assert.equal(saveRecord(settings, { volume: 0.2 }), true);
  assert.equal(localSaveStatus.getSnapshot(), 'unsaved');
  assert.equal(localSaveStatus.retry(), false);
  blocked.clear();
  assert.equal(saveRecord(profile, { xp: 30 }), true);
  assert.equal(localSaveStatus.getSnapshot(), 'saved');
  assert.equal(localSaveStatus.retry(), true);
  assert.equal(JSON.parse(values.get(profile.key)!).data.xp, 30);
});

it('partial retries retain unsaved records and save the latest offline queue', (t) => {
  const { spec, blocked, values } = fixture(t);
  const profile = spec('test.profile');
  const outbox = spec('test.outbox');
  blocked.add(profile.key);
  blocked.add(outbox.key);
  saveRecord(profile, { xp: 20 });
  saveRecord(outbox, { ops: ['old', 'new'] });
  // The old operation was confirmed online while storage was still full.
  saveRecord(outbox, { ops: ['new'] });
  blocked.delete(profile.key);
  assert.equal(localSaveStatus.retry(), false);
  assert.equal(localSaveStatus.getSnapshot(), 'unsaved');
  assert.equal(JSON.parse(values.get(profile.key)!).data.xp, 20);
  assert.equal(values.has(outbox.key), false);
  blocked.clear();
  assert.equal(localSaveStatus.retry(), true);
  assert.deepEqual(JSON.parse(values.get(outbox.key)!).data.ops, ['new']);
});

it('forgetting an account cache cancels its pending write even when storage is blocked', (t) => {
  const { spec, deny, values } = fixture(t);
  const cloud = spec('test.cloud.account');
  deny(true);
  saveRecord(cloud, { xp: 20 });
  clearRecord(cloud);
  deny(false);
  assert.equal(localSaveStatus.retry(), true);
  assert.equal(values.has(cloud.key), false);
});

it('an unserializable record cannot crash saving and can be replaced by a valid record', (t) => {
  const { spec, values } = fixture(t);
  const profile = spec('test.profile');
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.equal(saveRecord(profile, circular), false);
  assert.equal(localSaveStatus.getSnapshot(), 'unsaved');
  assert.equal(localSaveStatus.retry(), false);
  assert.equal(saveRecord(profile, { xp: 20 }), true);
  assert.equal(localSaveStatus.getSnapshot(), 'saved');
  assert.equal(JSON.parse(values.get(profile.key)!).data.xp, 20);
});

it('retry cannot overwrite an existing save that was unreadable when the session started', (t) => {
  const { spec, denyReads, values } = fixture(t);
  const profile = spec('test.profile');
  const existing = JSON.stringify({ v: 1, data: { xp: 500 } });
  values.set(profile.key, existing);
  denyReads(true);
  assert.equal(loadRecord(profile).fresh, true);
  saveRecord(profile, { xp: 10 });
  denyReads(false);
  assert.equal(
    localSaveStatus.retry(),
    false,
    'the temporary profile must not replace an unread save'
  );
  assert.equal(values.get(profile.key), existing);
  assert.equal(saveRecord(profile, { xp: 20 }), false);
  assert.equal(localSaveStatus.getSnapshot(), 'restore');
  assert.equal(values.get(profile.key), existing);
});

it('a blocked first launch can save after access returns if no older record exists', (t) => {
  const { spec, deny } = fixture(t);
  const profile = spec('test.profile');
  deny(true);
  loadRecord(profile);
  saveRecord(profile, { xp: 10 });
  deny(false);
  assert.equal(localSaveStatus.retry(), true);
  assert.deepEqual(loadRecord(profile).value, { xp: 10 });
  assert.equal(localSaveStatus.getSnapshot(), 'saved');
});
