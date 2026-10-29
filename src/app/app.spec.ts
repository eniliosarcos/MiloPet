import { TestBed } from '@angular/core/testing';

import type { MiloBridge } from '../shared/ipc';
import { App } from './app';
import { MILO } from './core/milo/milo-bridge';

/** Minimal stand-in for the Electron bridge, so the state machine is testable. */
function createFakeBridge() {
  let press: (() => void) | null = null;

  const bridge: MiloBridge = {
    onHotkey(handler) {
      press = handler;
      return () => {
        press = null;
      };
    },
    onHotkeyFailed() {
      return () => undefined;
    },
    setInteractive() {
      /* noop */
    },
    async getConfig() {
      return { hotkey: 'CommandOrControl+Shift+Space' };
    },
    async setHotkey(accelerator) {
      return { ok: true, accelerator };
    },
    setState() {
      /* noop */
    },
    quit() {
      /* noop */
    },
  };

  return { bridge, pressHotkey: () => press?.() };
}

describe('App', () => {
  let fake: ReturnType<typeof createFakeBridge>;

  beforeEach(async () => {
    fake = createFakeBridge();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: MILO, useValue: fake.bridge }],
    }).compileComponents();
  });

  it('renders the mascot in its idle state', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const stage = fixture.nativeElement.querySelector('.stage') as HTMLElement;
    expect(stage.getAttribute('data-state')).toBe('idle');
    expect(fixture.nativeElement.querySelector('app-mascot')).toBeTruthy();
  });

  it('starts listening when the hotkey fires', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();

    const stage = fixture.nativeElement.querySelector('.stage') as HTMLElement;
    expect(stage.getAttribute('data-state')).toBe('listening');
  });
});
