import { redirect } from 'next/navigation'

/** The dashboard root is the card overview. */
export default function DashboardPage() {
  redirect('/dashboard/karten')
}
