import { Repeat2 } from 'lucide-react';
export function TaskIcon({
  icon,
  size = 16,
}: {
  icon?: string;
  size?: number;
}) {
  return icon?.startsWith('data:image/') ? (
    <img
      src={icon}
      alt=""
      width={size}
      height={size}
      className="task-custom-icon"
      style={{ objectFit: 'contain' }}
    />
  ) : icon ? (
    <span
      className="task-custom-icon"
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {icon}
    </span>
  ) : (
    <Repeat2 size={size} />
  );
}
