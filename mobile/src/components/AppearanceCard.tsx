import { Card, Choice, H, Muted } from './ui';
import { useAppearance, type Appearance } from '../lib/theme';

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Match phone' },
];

/** Dark is the default; this is where someone opts out of it. */
export function AppearanceCard() {
  const { appearance, setAppearance } = useAppearance();
  return (
    <Card>
      <H>Appearance</H>
      <Choice value={appearance} options={OPTIONS} onChange={setAppearance} />
      <Muted>Dark is the default. The app restarts its screens when you change this.</Muted>
    </Card>
  );
}
