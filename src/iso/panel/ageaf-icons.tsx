/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGEAF CUSTOM ICONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Custom SVG icon library for the Ageaf panel
 * All icons designed to match the Emerald Studio aesthetic
 *
 * Usage:
 *   import { SettingsIcon, SendIcon } from './ageaf-icons';
 *   <SettingsIcon class="ageaf-toolbar-icon" />
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { h } from 'preact';

interface IconProps {
  class?: string;
  style?: any;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AGEAF LOGO
   ═══════════════════════════════════════════════════════════════════════════ */

export const AgeafLogo = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Geometric "A" shape with emerald gradient */}
    <defs>
      <linearGradient id="ageaf-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4dd4a4" />
        <stop offset="100%" stop-color="#39b98a" />
      </linearGradient>
    </defs>

    {/* Main triangle */}
    <path
      d="M16 4L28 28H4L16 4Z"
      fill="url(#ageaf-logo-gradient)"
      stroke="#2a9970"
      stroke-width="1.5"
      stroke-linejoin="round"
    />

    {/* Horizontal bar */}
    <rect
      x="10"
      y="18"
      width="12"
      height="2.5"
      rx="1.25"
      fill="#0a0e0c"
    />

    {/* Accent dot */}
    <circle cx="16" cy="10" r="1.5" fill="#4dd4a4" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   TOOLBAR ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

export const SettingsIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M16.32 12.5l-.87-.5a1.5 1.5 0 01-.75-1.3v-2.4c0-.52.28-1 .75-1.3l.87-.5a.5.5 0 00.18-.68l-1-1.74a.5.5 0 00-.68-.18l-.87.5a1.5 1.5 0 01-1.5 0l-2.08-1.2a1.5 1.5 0 01-.75-1.3V1.5a.5.5 0 00-.5-.5h-2a.5.5 0 00-.5.5v.98c0 .52-.28 1-.75 1.3l-2.08 1.2a1.5 1.5 0 01-1.5 0l-.87-.5a.5.5 0 00-.68.18l-1 1.74a.5.5 0 00.18.68l.87.5c.47.3.75.78.75 1.3v2.4c0 .52-.28 1-.75 1.3l-.87.5a.5.5 0 00-.18.68l1 1.74a.5.5 0 00.68.18l.87-.5a1.5 1.5 0 011.5 0l2.08 1.2c.47.3.75.78.75 1.3v.98a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-.98c0-.52.28-1 .75-1.3l2.08-1.2a1.5 1.5 0 011.5 0l.87.5a.5.5 0 00.68-.18l1-1.74a.5.5 0 00-.18-.68z"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const NewChatIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M14 2H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2z"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M10 8v4M8 10h4"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const ConversationsIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M3 6a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H7l-4 3V6z"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M7 8h6M7 11h4"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const AttachIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M16.5 10.5v5a3 3 0 01-3 3h-7a3 3 0 01-3-3v-10a2 2 0 012-2h8a2 2 0 012 2v9a1 1 0 01-1 1h-6a1 1 0 01-1-1V7"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const CollapseIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M13 7l-3 3-3-3M7 13l3-3 3 3"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   ACTION ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

export const SendIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M18 2L9 11M18 2l-5 16-4-7-7-4 16-5z"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const CopyIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <rect
      x="6.5"
      y="3.5"
      width="10"
      height="13"
      rx="1.5"
      stroke-width="1.5"
    />
    <path
      d="M3.5 6.5h2v10a2 2 0 002 2h7v2a2 2 0 01-2 2h-7a2 2 0 01-2-2v-12a2 2 0 012-2z"
      stroke-width="1.5"
    />
  </svg>
);

export const CheckIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M16 6L8.5 13.5 4 9"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const ExpandIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M13 7l-3 3-3-3"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const CloseIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M14 6L6 14M6 6l8 8"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const ScrollDownIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M10 4v12M10 16l-4-4M10 16l4-4"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   STATUS ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

export const ThinkingIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5" />
    <circle cx="7" cy="9" r="1.5" fill="currentColor" />
    <circle cx="13" cy="9" r="1.5" fill="currentColor" />
    <path
      d="M7 13c.5 1 1.5 2 3 2s2.5-1 3-2"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
);

export const ToolIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M15.5 3.5l1 1M11 8l2.5 2.5M3 17l3-3M7.5 12.5l-2-2a2 2 0 010-2.83l3.83-3.83a2 2 0 012.83 0l2 2a2 2 0 010 2.83l-3.83 3.83a2 2 0 01-2.83 0z"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const SpinnerIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={{...style, animation: 'spin 1s linear infinite'}}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle
      cx="10"
      cy="10"
      r="7"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-dasharray="32"
      stroke-dashoffset="8"
      opacity="0.25"
    />
    <circle
      cx="10"
      cy="10"
      r="7"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-dasharray="8 32"
    />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   PROVIDER ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

export const ClaudeIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.1" />
    <path
      d="M10 6v8M6 10h8"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
);

export const CodexIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M7 7l-3 3 3 3M13 7l3 3-3 3M11 5l-2 10"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   TOOLBAR ACTION ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

export const RewriteIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M3 12h12M3 16h8M7 4l3-3m0 0l3 3m-3-3v8"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const AttachFilesIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M16.5 10.5v5a3 3 0 01-3 3h-7a3 3 0 01-3-3v-10a2 2 0 012-2h8a2 2 0 012 2v9a1 1 0 01-1 1h-6a1 1 0 01-1-1V7"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const NewChatIconAlt = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M10 5v10M5 10h10"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const CloseSessionIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M7 13l3-3-3-3M11 10H3M14 3h3v14h-3"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const ClearChatIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M5 7h10M8 7V5a1 1 0 011-1h2a1 1 0 011 1v2M6 7v9a2 2 0 002 2h4a2 2 0 002-2V7M9 10v4M11 10v4"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const CheckReferencesIcon = ({ class: className, style }: IconProps) => (
  <svg
    class={className}
    style={style}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <path
      d="M4 2.5h8a2 2 0 012 2v11a2 2 0 01-2 2H4a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M7 6h4M7 9h4"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M12 12l2 2 4-4"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT ALL
   ═══════════════════════════════════════════════════════════════════════════ */

export const Icons = {
  AgeafLogo,
  SettingsIcon,
  NewChatIcon,
  ConversationsIcon,
  AttachIcon,
  CollapseIcon,
  SendIcon,
  CopyIcon,
  CheckIcon,
  ExpandIcon,
  CloseIcon,
  ScrollDownIcon,
  ThinkingIcon,
  ToolIcon,
  SpinnerIcon,
  ClaudeIcon,
  CodexIcon,
  // Toolbar actions
  RewriteIcon,
  CheckReferencesIcon,
  AttachFilesIcon,
  NewChatIconAlt,
  CloseSessionIcon,
  ClearChatIcon,
};

export default Icons;
