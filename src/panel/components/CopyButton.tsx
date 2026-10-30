import { useState } from 'react';
import { copyText } from '../utils/clipboard';
import { Icon } from './Icon';

export function CopyButton({
  text,
  label = 'Copy',
  showLabel = false,
}: {
  text: string | (() => string);
  label?: string;
  showLabel?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={showLabel ? 'btn' : 'icon-btn'}
      title={label}
      aria-label={label}
      onClick={async () => {
        if (
          await copyText(typeof text === 'function' ? text() : text, `${label.replace(/^Copy/, 'Copied')}`)
        ) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
    >
      <Icon name={done ? 'check' : 'copy'} />
      {showLabel && <span>{label}</span>}
    </button>
  );
}
