'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type DashboardAccountStatus = 'active' | 'pending_verification' | 'suspended';

interface DashboardAccountContextValue {
  accountStatus: DashboardAccountStatus;
  isSuspended: boolean;
}

const DashboardAccountContext = createContext<DashboardAccountContextValue>({
  accountStatus: 'active',
  isSuspended: false,
});

export function DashboardAccountProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: DashboardAccountContextValue;
}) {
  return (
    <DashboardAccountContext.Provider value={value}>
      {children}
    </DashboardAccountContext.Provider>
  );
}

export function useDashboardAccount() {
  return useContext(DashboardAccountContext);
}
