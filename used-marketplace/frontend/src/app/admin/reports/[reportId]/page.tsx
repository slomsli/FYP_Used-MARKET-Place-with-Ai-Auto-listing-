import type { Metadata } from 'next';
import ReportDetailClient from './ReportDetailClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Report Detail | ReMarket',
  description: 'Review a report, inspect the case context, and take moderation action.',
};

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;

  return <ReportDetailClient reportId={reportId} />;
}
