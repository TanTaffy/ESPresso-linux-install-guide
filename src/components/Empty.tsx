import { Layers3 } from 'lucide-react';
import type { ReactNode } from 'react';
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Layers3 size={29} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
