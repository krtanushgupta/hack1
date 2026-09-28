import React from 'react';

interface PlatformLogoProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export const PlatformLogo: React.FC<PlatformLogoProps> = ({ name, size = 'md' }) => {
  const normalized = name.toLowerCase();

  const dimensions =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-10 h-10 text-sm';

  if (normalized.includes('blinkit')) {
    return (
      <div
        className={`${dimensions} rounded-lg bg-[#F8CB46] flex items-center justify-center shrink-0 border border-amber-400/60 select-none`}
        aria-label="Blinkit logo"
      >
        <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
          <text
            x="4"
            y="26"
            fill="#111827"
            fontFamily="Syne, sans-serif"
            fontWeight="700"
            fontSize="16"
            letterSpacing="-0.5"
          >
            bl
          </text>
          <text
            x="19"
            y="26"
            fill="#15803D"
            fontFamily="Syne, sans-serif"
            fontWeight="700"
            fontSize="16"
            letterSpacing="-0.5"
          >
            it
          </text>
          <path
            d="M31 11L27.5 18H31.5L28 26L35 16.5H30.8L31 11Z"
            fill="#15803D"
          />
        </svg>
      </div>
    );
  }

  if (normalized.includes('flipkart')) {
    return (
      <div
        className={`${dimensions} rounded-lg bg-[#2874F0] flex items-center justify-center shrink-0 border border-blue-600 select-none`}
        aria-label="Flipkart Minutes logo"
      >
        <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
          <path
            d="M11 12H26L24.5 16.5H15.5V19.5H23L21.8 23.5H15.5V30H11V12Z"
            fill="#FFE500"
          />
          <circle cx="29" cy="26" r="5.5" fill="#FFE500" />
          <path
            d="M29 22.8V26.2L31.2 27.5"
            stroke="#1E3A8A"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (normalized.includes('amazon')) {
    return (
      <div
        className={`${dimensions} rounded-lg bg-[#232F3E] flex items-center justify-center shrink-0 border border-slate-700 select-none`}
        aria-label="Amazon Minutes logo"
      >
        <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
          <text
            x="8"
            y="23"
            fill="#FFFFFF"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="700"
            fontSize="16"
          >
            a
          </text>
          <path
            d="M8 27.5C13.5 31 22.5 31 28.5 27"
            stroke="#FF9900"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M26 25.5L29.5 26.8L27.8 30"
            stroke="#FF9900"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M27 11L23.5 17H27.2L24.5 22.5L31 15.2H27.2L27 11Z"
            fill="#FF9900"
          />
        </svg>
      </div>
    );
  }

  if (normalized.includes('zepto')) {
    return (
      <div
        className={`${dimensions} rounded-lg bg-[#3B0764] flex items-center justify-center shrink-0 border border-purple-900 select-none`}
        aria-label="Zepto logo"
      >
        <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
          <path
            d="M11 13H28L16.5 25H28.5"
            stroke="#FF3269"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M27 9L24 14.5H27.5L25 19.5"
            stroke="#FACC15"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`${dimensions} rounded-lg bg-slate-900 text-white font-display font-bold flex items-center justify-center shrink-0`}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
};
