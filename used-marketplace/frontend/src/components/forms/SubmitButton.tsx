'use client';

import { ButtonHTMLAttributes } from 'react';
import Spinner from '@/src/components/ui/Spinner';

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
  showArrow?: boolean;
}

export default function SubmitButton({
  loading = false,
  children,
  showArrow = false,
  disabled,
  className,
  ...props
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className={`
        w-full h-12 flex items-center justify-center gap-2
        bg-navy-800 hover:bg-navy-900 active:bg-navy-950
        text-white font-semibold text-[0.9375rem]
        rounded-xl transition-all duration-200
        disabled:opacity-60 disabled:cursor-not-allowed
        cursor-pointer shadow-sm hover:shadow-md
        ${className || ''}
      `}
      {...props}
    >
      {loading ? (
        <Spinner size={20} className="text-white" />
      ) : (
        <>
          {children}
          {showArrow && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          )}
        </>
      )}
    </button>
  );
}
