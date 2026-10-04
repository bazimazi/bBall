import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import { GameAudio } from '../../src/game/audio';
import { AUDIO_MIX, volumeGain } from '../../src/game/audioMix';

/** Only lifecycle calls are simulated; graph nodes do not render samples. */
class TestParam {
  value = 0;
  setTargetAtTime(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number) {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime(value: number) {
    this.value = value;
  }
  cancelScheduledValues() {}
}

class TestNode {
  gain = new TestParam();
  frequency = new TestParam();
  Q = new TestParam();
  threshold = new TestParam();
  knee = new TestParam();
  ratio = new TestParam();
  attack = new TestParam();
  release = new TestParam();
  detune = new TestParam();
  pan = new TestParam();
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}

class TestContextAudio {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 800;
  destination = new TestNode();
  resumes = 0;
  suspends = 0;
  closes = 0;
  gains: TestNode[] = [];
  failGraph = false;
  resumeResult: () => Promise<void> = async () => {
    this.state = 'running';
  };
  suspendResult: () => Promise<void> = async () => {
    this.state = 'suspended';
  };
  closeResult: () => Promise<void> = async () => {
    this.state = 'closed';
  };
  resume() {
    this.resumes++;
    return this.resumeResult();
  }
  suspend() {
    this.suspends++;
    return this.suspendResult();
  }
  close() {
    this.closes++;
    return this.closeResult();
  }
  createGain() {
    const node = new TestNode();
    this.gains.push(node);
    return node;
  }
  createDynamicsCompressor() {
    if (this.failGraph) throw new Error('Audio graph unavailable');
    return new TestNode();
  }
  createBiquadFilter() {
    return new TestNode();
  }
  createConvolver() {
    return new TestNode();
  }
  createOscillator() {
    return new TestNode();
  }
  createBufferSource() {
    return new TestNode();
  }
  createStereoPanner() {
    return new TestNode();
  }
  createBuffer(channels: number, length: number, rate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / rate, getChannelData: (channel: number) => data[channel]! };
  }
}

function harness(t: TestContext, initial: AudioContextState = 'running') {
  const contexts: TestContextAudio[] = [];
  const storage = new Map<string, string>();
  const win: { AudioContext?: unknown; webkitAudioContext?: unknown; localStorage: unknown } = {
    AudioContext: class extends TestContextAudio {
      constructor() {
        super();
        this.state = initial;
        contexts.push(this);
      }
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    }
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
  const audio = new GameAudio();
  t.after(() => {
    audio.dispose();
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return { audio, contexts, win, storage };
}

it('the first unlock requests resume when the newly created audio context is suspended', (t) => {
  const { audio, contexts } = harness(t, 'suspended');
  assert.equal(contexts.length, 0, 'audio is still created only on demand');
  audio.unlock();
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0]!.resumes, 1, 'the first user gesture must also resume its new graph');
});

it('a user gesture requests recovery of interrupted audio without rebuilding its graph', (t) => {
  const { audio, contexts } = harness(t);
  audio.unlock();
  const context = contexts[0]!;
  const graphSize = context.gains.length;
  context.state = 'interrupted';
  audio.unlock();
  assert.equal(context.resumes, 1);
  assert.equal(context.state, 'running');
  assert.equal(contexts.length, 1);
  assert.equal(context.gains.length, graphSize);
});

it('background suspension also holds an interrupted context; recovery retains both volume buses', (t) => {
  const { audio, contexts } = harness(t);
  audio.setVolumes(0.2, 0.3);
  audio.unlock();
  const context = contexts[0]!;
  const gains = context.gains.slice(0, 3).map((node) => node.gain.value);
  assert.deepEqual(gains, [AUDIO_MIX.master, volumeGain(0.3) * AUDIO_MIX.effects, volumeGain(0.2)]);
  context.state = 'interrupted';
  audio.suspend();
  assert.equal(context.suspends, 1);
  assert.equal(context.state, 'suspended');
  audio.suspend();
  assert.equal(context.suspends, 1, 'an already held context needs no second suspension');
  audio.resume();
  assert.equal(context.state, 'running');
  assert.deepEqual(
    context.gains.slice(0, 3).map((node) => node.gain.value),
    gains
  );
});

it('automatic audio recovery respects mute and skips running or closed contexts', (t) => {
  const { audio, contexts, storage } = harness(t);
  audio.resume();
  assert.equal(contexts.length, 0, 'visibility alone cannot create audio');
  audio.unlock();
  const context = contexts[0]!;
  audio.setMuted(true);
  context.state = 'interrupted';
  audio.resume();
  assert.equal(context.resumes, 0);
  assert.equal(audio.muted, true);
  assert.equal(storage.get('bball.muted'), '1');
  audio.unlock();
  assert.equal(context.resumes, 1, 'an explicit gesture may unlock a still-silent graph');
  assert.equal(context.gains[0]!.gain.value, 0, 'unlock never unmutes the player');
  audio.setMuted(false);
  audio.resume();
  assert.equal(context.resumes, 1, 'running audio requires no resume request');
  context.state = 'closed';
  audio.unlock();
  audio.resume();
  audio.suspend();
  audio.dispose();
  assert.deepEqual([context.resumes, context.suspends, context.closes], [1, 0, 0]);
});

for (const kind of ['throw', 'reject'] as const) {
  it(`audio lifecycle ${kind} failures stay contained and later gestures can retry`, async (t) => {
    const { audio, contexts } = harness(t);
    audio.unlock();
    const context = contexts[0]!;
    const refused = () => {
      const error = new Error('Device refused audio operation');
      if (kind === 'throw') throw error;
      return Promise.reject(error);
    };
    context.state = 'interrupted';
    context.resumeResult = refused;
    assert.doesNotThrow(() => audio.unlock());
    assert.doesNotThrow(() => audio.resume());
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(context.state, 'interrupted');
    context.resumeResult = async () => {
      context.state = 'running';
    };
    audio.unlock();
    assert.equal(context.state, 'running');
    assert.equal(contexts.length, 1, 'failure does not discard a recoverable graph');
    context.suspendResult = refused;
    assert.doesNotThrow(() => audio.suspend());
    context.closeResult = refused;
    assert.doesNotThrow(() => audio.dispose());
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(context.suspends, 1);
    assert.equal(context.closes, 1);
    audio.unlock();
    assert.equal(contexts.length, 2, 'disposed references are released even when close is refused');
  });
}

it('a pending automatic resume does not block a later user gesture or alter a replacement graph', async (t) => {
  const { audio, contexts } = harness(t);
  audio.unlock();
  const old = contexts[0]!;
  const requests: { resolve: () => void; reject: (reason: Error) => void }[] = [];
  old.resumeResult = () =>
    new Promise<void>((resolve, reject) => requests.push({ resolve, reject }));
  old.state = 'suspended';
  audio.resume();
  audio.unlock();
  assert.equal(old.resumes, 2, 'an unresolved policy request must not lock out a new gesture');
  audio.dispose();
  audio.unlock();
  const replacement = contexts[1]!;
  requests[0]!.reject(new Error('Old context was closed'));
  requests[1]!.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  replacement.state = 'interrupted';
  audio.unlock();
  assert.equal(replacement.resumes, 1);
  assert.equal(replacement.state, 'running');
  assert.equal(contexts.length, 2);
});

it('failed graph construction releases its context and preserves preferences for a fresh attempt', (t) => {
  const { audio, contexts, win } = harness(t);
  const Ctor = win.AudioContext as new () => TestContextAudio;
  win.AudioContext = class extends Ctor {
    constructor() {
      super();
      this.failGraph = true;
    }
  };
  audio.setVolumes(0.4, 0);
  audio.setMuted(true);
  assert.doesNotThrow(() => audio.unlock());
  assert.equal(contexts[0]!.closes, 1, 'partial graphs must not leak hardware contexts');
  assert.equal(contexts[0]!.state, 'closed');
  win.AudioContext = Ctor;
  audio.unlock();
  assert.equal(contexts.length, 2);
  assert.equal(audio.muted, true);
  assert.deepEqual(
    contexts[1]!.gains.slice(0, 3).map((node) => node.gain.value),
    [0, 0, volumeGain(0.4)]
  );
});

it('audio remains optional when missing or refused, and the WebKit constructor also resumes on first use', (t) => {
  const { audio, contexts, win } = harness(t, 'suspended');
  const Ctor = win.AudioContext;
  delete win.AudioContext;
  assert.doesNotThrow(() => {
    audio.unlock();
    audio.suspend();
    audio.resume();
    audio.dispose();
  });
  assert.equal(contexts.length, 0);
  win.AudioContext = class {
    constructor() {
      throw new Error('Audio access refused');
    }
  };
  assert.doesNotThrow(() => audio.unlock());
  assert.equal(contexts.length, 0);
  delete win.AudioContext;
  win.webkitAudioContext = Ctor;
  audio.unlock();
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0]!.resumes, 1);
});
