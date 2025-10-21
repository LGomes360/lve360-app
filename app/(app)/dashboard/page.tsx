// app/(app)/dashboard/page.tsx  (SERVER COMPONENT)
import { requireTier } from '@/app/_auth/requireTier';
import DashboardClient from './DashboardClient';

export default async function Page() {
  await requireTier(['premium', 'trial']); // Premium-only access
  return <DashboardClient />;
}
