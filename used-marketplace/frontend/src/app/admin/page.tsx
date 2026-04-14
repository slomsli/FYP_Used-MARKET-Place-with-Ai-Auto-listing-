import { redirect } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';

export default function AdminPage() {
  redirect(ROUTES.ADMIN_USERS);
}
