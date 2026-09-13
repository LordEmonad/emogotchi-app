import { PROPS, type PropName } from '../scene/props';

/** One of our hand-drawn props as an inline icon. */
export function Icon({ name, size = 20, className = '' }: { name: PropName; size?: number; className?: string }) {
  return <span className={`icon ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: PROPS[name] }} />;
}
