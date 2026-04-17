'use client';

import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

const quickLinks = [
  {
    title: 'Open pending reports',
    description: 'Start with complaints that still need a first moderation decision.',
    href: `${ROUTES.ADMIN_REPORTS}?status=pending`,
  },
  {
    title: 'Review flagged listings',
    description: 'Check listings that still have open complaints or need visibility changes.',
    href: ROUTES.ADMIN_LISTINGS,
  },
  {
    title: 'Open user directory',
    description: 'Inspect an account before messaging, suspending, or restoring access.',
    href: ROUTES.ADMIN_USERS,
  },
  {
    title: 'Manage structure',
    description: 'Keep categories and regional coverage aligned with the live marketplace.',
    href: ROUTES.ADMIN_STRUCTURE,
  },
];

const workflows = [
  {
    title: 'Report Triage',
    steps: [
      'Read the reporter details and reason before changing any status.',
      'Use the moderation summary to confirm whether the listing is still visible or already paused.',
      'Message the seller if context is missing, then resolve or dismiss the report when the case is clear.',
    ],
  },
  {
    title: 'Listing Enforcement',
    steps: [
      'Pause a listing when it should disappear from browse while you investigate.',
      'Delete a listing only when the item clearly breaks policy and the related records should be removed too.',
      'Resume a listing after the issue is resolved and the seller is safe to go live again.',
    ],
  },
  {
    title: 'User Review',
    steps: [
      'Inspect account details, recent listings, and last sign-in before taking action.',
      'Use moderation threads for account issues so the conversation stays recorded inside the platform.',
      'Suspend accounts when they should lose marketplace actions without losing login access.',
    ],
  },
];

const checklist = [
  'Reporter note includes clear evidence or context.',
  'Listing visibility matches the current risk level.',
  'Seller has been contacted when clarification is still needed.',
  'Final report status reflects the real moderation outcome.',
];

export default function AdminGuidePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Operations Guide</p>
          <h1 className={styles.title}>Admin playbook for moderation and marketplace control.</h1>
          <p className={styles.subtitle}>
            Use this page as the shared workflow reference for reports, listings, user actions, and
            structure management. It keeps the admin tools aligned with the purpose of each action.
          </p>
        </div>

        <Link href={`${ROUTES.ADMIN_REPORTS}?status=pending`} className={styles.primaryButton}>
          Start Pending Reports
        </Link>
      </section>

      <section className={styles.quickGrid}>
        {quickLinks.map((item) => (
          <Link key={item.title} href={item.href} className={styles.quickCard}>
            <span className={styles.quickLabel}>Quick Link</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </Link>
        ))}
      </section>

      <section className={styles.workflowGrid}>
        {workflows.map((workflow) => (
          <article key={workflow.title} className={styles.workflowCard}>
            <p className={styles.cardEyebrow}>Workflow</p>
            <h2>{workflow.title}</h2>
            <div className={styles.stepList}>
              {workflow.steps.map((step) => (
                <p key={step}>{step}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className={styles.supportGrid}>
        <article className={styles.checklistCard}>
          <p className={styles.cardEyebrow}>Before You Close A Case</p>
          <h2>Moderation checklist</h2>
          <div className={styles.checklist}>
            {checklist.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </article>

        <article className={styles.noteCard}>
          <p className={styles.cardEyebrow}>Good Practice</p>
          <h2>Use the inbox before assumptions.</h2>
          <p>
            The admin messages workspace is the safest place to ask for proof, clarify suspicious
            behavior, and keep a record of the moderation thread before escalating to suspension or
            deletion.
          </p>
          <Link href={ROUTES.ADMIN_MESSAGES} className={styles.secondaryButton}>
            Open Admin Inbox
          </Link>
        </article>
      </section>
    </div>
  );
}
