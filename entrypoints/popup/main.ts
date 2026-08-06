import { browser } from '#imports';
import { PLATFORMS } from '../../lib/platforms';
import {
  getSettings,
  DISABLE_ALARM,
  DISABLE_MINUTES,
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
        option(opt.label, current[platform.id][opt.key], (checked) =>
          void updatePlatform(platform.id, { [opt.key]: checked }),
        ),
      );
    }

    list.append(item);
  }
}

const disableButton = document.getElementById('disable') as HTMLButtonElement;
// The label only, not the button: the button also holds the clock icon,
// which writing to its textContent would delete.
const disableLabel = document.getElementById('disable-label')!;

async function renderDisable() {
  const until = await disabledUntil.getValue();
  const remaining = until - Date.now();
  if (remaining > 0) {
    const m = Math.floor(remaining / 60_000);
    const s = Math.floor((remaining % 60_000) / 1000);
    disableLabel.textContent = `Disabled, ${m}:${String(s).padStart(2, '0')} left. Tap to re-enable.`;
    disableButton.classList.add('active');
  } else {
    disableLabel.textContent = `Disable for ${DISABLE_MINUTES} minutes`;
    disableButton.classList.remove('active');
  }
}

disableButton.addEventListener('click', async () => {
  if ((await disabledUntil.getValue()) > Date.now()) {
    await browser.alarms.clear(DISABLE_ALARM);
    await disabledUntil.setValue(0);
  } else {
    const until = Date.now() + DISABLE_MINUTES * 60_000;
    await disabledUntil.setValue(until);
    await browser.alarms.create(DISABLE_ALARM, { when: until });
  }
  void renderDisable();
});

setInterval(() => void renderDisable(), 1000);
disabledUntil.watch(() => void renderDisable());

void render();
void renderDisable();
