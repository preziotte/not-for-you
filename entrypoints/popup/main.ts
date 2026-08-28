import { browser } from '#imports';
import { PLATFORMS } from '../../lib/platforms';
import {
  getSettings,
  DISABLE_ALARM,
  DISABLE_PRESETS,
  disabledUntil,
  updatePlatform,
} from '../../lib/settings';

function checkbox(
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

function option(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  disabled = false,
): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'option';
  const input = checkbox(checked, onChange);
  input.disabled = disabled;
  const name = document.createElement('span');
  name.textContent = label;
  row.append(input, name);
  return row;
}

async function render() {
  const current = await getSettings();
  const list = document.getElementById('platform-list')!;

  for (const platform of PLATFORMS) {
    const item = document.createElement('li');

    const title = document.createElement('div');
    title.className = 'site';
    const icon = document.createElement('img');
    icon.src = `/sites/${platform.id}.png`;
    icon.alt = '';
    icon.width = 16;
    icon.height = 16;
    const name = document.createElement('span');
    name.textContent = platform.label;
    title.append(icon, name);
    item.append(title);

    item.append(
      option(
        platform.enabledLabel,
        !platform.comingSoon && current[platform.id].enabled,
        (checked) => void updatePlatform(platform.id, { enabled: checked }),
        platform.comingSoon,
      ),
    );

    for (const opt of platform.options) {
      item.append(
        option(
          opt.label,
          current[platform.id][opt.key],
          (checked) => void updatePlatform(platform.id, { [opt.key]: checked }),
        ),
      );
    }

    list.append(item);
  }
}

// A rating belongs on the listing the copy came from, and the markup carries
// the Chrome one. Build-time flag, so the branch is dropped from the Chrome
// build entirely.
if (import.meta.env.FIREFOX) {
  const rate = document.getElementById('rate') as HTMLAnchorElement;
  rate.href = 'https://addons.mozilla.org/firefox/addon/notforyou/reviews/';
}

const disableHeading = document.querySelector<HTMLElement>('.disable-heading')!;
const disablePresets = document.getElementById('disable-presets')!;
const disableActive = document.getElementById('disable-active')!;
const disableLabel = document.getElementById('disable-label')!;
const enableButton = document.getElementById('enable') as HTMLButtonElement;

async function startDisable(until: number) {
  await disabledUntil.setValue(until);
  await browser.alarms.create(DISABLE_ALARM, { when: until });
  void renderDisable();
}

async function endDisable() {
  await browser.alarms.clear(DISABLE_ALARM);
  await disabledUntil.setValue(0);
  void renderDisable();
}

for (const preset of DISABLE_PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = preset.label;
  button.addEventListener('click', () => void startDisable(preset.until()));
  disablePresets.append(button);
}
enableButton.addEventListener('click', () => void endDisable());

function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

async function renderDisable() {
  const remaining = (await disabledUntil.getValue()) - Date.now();
  const active = remaining > 0;
  disableHeading.hidden = active;
  disablePresets.hidden = active;
  disableActive.hidden = !active;
  // The list stays visible but fades and locks: the configuration is
  // preserved, it just is not doing anything right now.
  document.body.classList.toggle('paused', active);
  if (active)
    disableLabel.textContent = `Paused, ${formatRemaining(remaining)} left`;
}

setInterval(() => void renderDisable(), 1000);
disabledUntil.watch(() => void renderDisable());

void render();
void renderDisable();
