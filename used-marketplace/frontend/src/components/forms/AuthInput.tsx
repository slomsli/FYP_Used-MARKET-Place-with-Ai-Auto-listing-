'use client';

import { InputHTMLAttributes, ReactNode } from 'react';

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
  rightElement?: ReactNode;
}

export default function AuthInput({
  label,
  icon,
  error,
  rightElement,
  id,
  className,
  ...props
}: AuthInputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      <div
        className={`
          flex items-center gap-2.5 px-3.5 h-12 rounded-xl transition-all duration-200
          ${
            error
              ? 'bg-red-50 border border-red-300 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100'
              : 'bg-gray-100 border border-transparent focus-within:border-navy-800/30 focus-within:ring-2 focus-within:ring-navy-800/10 focus-within:bg-white'
          }
        `}
      >
        {icon && (
          <span className="text-gray-400 flex shrink-0">{icon}</span>
        )}
        <input
          id={inputId}
          className="flex-1 bg-transparent text-[0.9375rem] text-gray-900 outline-none placeholder:text-gray-400 w-full"
          {...props}
        />
        {rightElement}
      </div>
      {error && (
        <span className="text-[0.8125rem] text-red-600 mt-0.5">{error}</span>
      )}
    </div>
  );
}
