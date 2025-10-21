// app/(app)/dashboard/page.tsx  (SERVER COMPONENT)
import { requireAuth } from '@/app/_auth/requireAuth';
import DashboardClient from './DashboardClient';

export default async function Page() {
  await requireAuth(); // server-side gate, no UI flash
  return <DashboardClient />;
}
